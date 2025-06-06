import {
    composeContext,
    elizaLogger,
    generateMessageResponse,
    getEmbeddingZeroVector,
    getEnvVariable,
    messageCompletionFooter,
    ModelClass,
    settings,
    stringToUuid,
    type Client,
    type Content,
    type IAgentRuntime,
    type Memory,
    type Plugin,
} from "@elizaos/core";
import bodyParser from "body-parser";
import cors from "cors";
import express, { type Request as ExpressRequest } from "express";
import * as fs from "fs";
import multer from "multer";
import * as path from "path";
import { createApiRouter } from "./api.ts";
import { createVerifiableLogApiRouter } from "./verifiable-log-api.ts";
import { tryJWTWithoutError } from "./jwt.ts";
import { createA2ARouter } from "./a2a.ts";
import { paymentMiddleware } from "x402-express";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), "data", "uploads");
        // Create the directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});

// some people have more memory than disk.io
const upload = multer({ storage /*: multer.memoryStorage() */ });

export const messageHandlerTemplate =
    // {{goals}}
    // "# Action Examples" is already included
    `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.
` + messageCompletionFooter;

export class DirectClient {
    public app: express.Application;
    private agents: Map<string, IAgentRuntime>; // container management
    private server: any; // Store server instance
    public startAgent: Function; // Store startAgent functor
    public loadCharacterTryPath: Function; // Store loadCharacterTryPath functor
    public jsonToCharacter: Function; // Store jsonToCharacter functor

    constructor() {
        elizaLogger.log("DirectClient constructor");
        this.app = express();

        const payTo = getEnvVariable("CHROMA_PAY_TO");

        if (payTo) {
            this.app.use(
                paymentMiddleware(
                    payTo as `0x${string}`,
                    {
                        "POST /*/message": {
                            price: "$0.001",
                            network: "base-sepolia",
                        },
                    },
                    {
                        url: "https://x402.org/facilitator", // Facilitator URL for Base Sepolia testnet.
                    }
                )
            );
        }

        this.app.use(cors());
        this.agents = new Map();

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        // Serve both uploads and generated images
        this.app.use(
            "/media/uploads",
            express.static(path.join(process.cwd(), "/data/uploads"))
        );
        this.app.use(
            "/media/generated",
            express.static(path.join(process.cwd(), "/generatedImages"))
        );

        const apiRouter = createApiRouter(this.agents, this);
        this.app.use(apiRouter);

        const apiLogRouter = createVerifiableLogApiRouter(this.agents);
        this.app.use(apiLogRouter);

        // Setup A2A Router
        const a2aRouter = createA2ARouter(this.agents);

        this.app.use(a2aRouter);

        this.app.post(
            "/:agentId/message",
            tryJWTWithoutError,
            upload.single("file"), // Needed to get req.body.attrs available WTF
            async (req: express.Request, res: express.Response) => {
                const agentId = req.params.agentId;

                let runtime = this.agents.get(agentId);

                // if runtime is null, look for runtime with the same name
                if (!runtime) {
                    runtime = Array.from(this.agents.values()).find(
                        (a) =>
                            a.character.name.toLowerCase() ===
                            agentId.toLowerCase()
                    );
                }

                if (!runtime) {
                    res.status(404).send("Agent not found");
                    return;
                }

                const roomId = stringToUuid(
                    req['jwtUserId'] ?? req.body.roomId ?? "default-room-" + agentId
                );
                const userId = stringToUuid(req['jwtUserId'] ?? req.body.userId ?? "user");

                await runtime.ensureConnection(
                    userId,
                    roomId,
                    req.body.userName,
                    req.body.name,
                    "direct"
                );

                const requestAction = req.body.action;
                const elizaAction = requestAction && runtime.actions.find((a) => a.name === requestAction);
                const text = req.body.text || requestAction;

                if (!text && !elizaAction) {
                    res.json([]);
                    return;
                }

                const messageId = stringToUuid(Date.now().toString());

                // Here goes the preferred protocol (e.g. Beefy, yearn, Aave, etc)
                let protocols = req.body.protocols;
                if (protocols?.length > 0) {
                    const cacheKey = path.join(runtime.agentId, userId, "protocols");
                    await runtime.cacheManager.set(cacheKey, protocols);
                }

                const content: Content = {
                    text,
                    source: "direct",
                    inReplyTo: undefined,
                };

                const userMessage = {
                    content,
                    userId,
                    roomId,
                    agentId: runtime.agentId,
                };

                const memory: Memory = {
                    id: stringToUuid(messageId + "-" + userId),
                    ...userMessage,
                    agentId: runtime.agentId,
                    userId,
                    roomId,
                    content,
                    createdAt: Date.now(),
                };

                await runtime.messageManager.addEmbeddingToMemory(memory);
                await runtime.messageManager.createMemory(memory);

                let state = await runtime.composeState(userMessage, {
                    agentName: runtime.character.name,
                });

                let response;

                // Use requested action
                if (elizaAction) {
                    response = {
                        text:   text,
                        action: elizaAction.name,
                        user:   "Chroma"
                    }
                // Compose the message from text
                } else {
                    const context = composeContext({
                        state,
                        template: messageHandlerTemplate,
                    });

                    response = await generateMessageResponse({
                        runtime: runtime,
                        context,
                        modelClass: ModelClass.LARGE,
                    });
                    console.log(response)

                    if (!response) {
                        res.status(500).send(
                            "No response from generateMessageResponse"
                        );
                        return;
                    }
                }

                // save response to memory
                const responseMessage: Memory = {
                    id: stringToUuid(messageId + "-" + runtime.agentId),
                    ...userMessage,
                    userId: runtime.agentId,
                    content: response,
                    embedding: getEmbeddingZeroVector(),
                    createdAt: Date.now(),
                };

                await runtime.messageManager.createMemory(responseMessage);

                state = await runtime.updateRecentMessageState(state);

                let message = null as Content | null;

                await runtime.processActions(
                    memory,
                    [responseMessage],
                    state,
                    async (newMessages) => {
                        message = newMessages;
                        return [memory];
                    }
                );

                await runtime.evaluate(memory, state);

                if (message) {
                    res.json([message]);
                } else if (response) {
                    res.json([response]);
                } else {
                    res.json([]);
                }
            }
        );
    }

    // agent/src/index.ts:startAgent calls this
    public registerAgent(runtime: IAgentRuntime) {
        // register any plugin endpoints?
        // but once and only once
        this.agents.set(runtime.agentId, runtime);
    }

    public unregisterAgent(runtime: IAgentRuntime) {
        this.agents.delete(runtime.agentId);
    }

    public start(port: number) {
        this.server = this.app.listen(port, () => {
            elizaLogger.success(
                `REST API bound to 0.0.0.0:${port}. If running locally, access it at http://localhost:${port}.`
            );
        });

        // Handle graceful shutdown
        const gracefulShutdown = () => {
            elizaLogger.log("Received shutdown signal, closing server...");
            this.server.close(() => {
                elizaLogger.success("Server closed successfully");
                process.exit(0);
            });

            // Force close after 5 seconds if server hasn't closed
            setTimeout(() => {
                elizaLogger.error(
                    "Could not close connections in time, forcefully shutting down"
                );
                process.exit(1);
            }, 5000);
        };

        // Handle different shutdown signals
        process.on("SIGTERM", gracefulShutdown);
        process.on("SIGINT", gracefulShutdown);
    }

    public async stop() {
        if (this.server) {
            this.server.close(() => {
                elizaLogger.success("Server stopped");
            });
        }
    }
}

export const DirectClientInterface: Client = {
    name: 'direct',
    config: {},
    start: async (_runtime: IAgentRuntime) => {
        elizaLogger.log("DirectClientInterface start");
        const client = new DirectClient();
        const serverPort = Number.parseInt(settings.SERVER_PORT || "3000");
        client.start(serverPort);
        return client;
    },
    // stop: async (_runtime: IAgentRuntime, client?: Client) => {
    //     if (client instanceof DirectClient) {
    //         client.stop();
    //     }
    // },
};

const directPlugin: Plugin = {
    name: "direct",
    description: "Direct client",
    clients: [DirectClientInterface],
};
export default directPlugin;
