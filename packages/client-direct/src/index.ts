import {
    composeContext,
    elizaLogger,
    generateMessageResponse,
    getEmbeddingZeroVector,
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

export const hyperfiHandlerTemplate = `{{actionExamples}}
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

Response format should be formatted in a JSON block like this:
\`\`\`json
{ "lookAt": "{{nearby}}" or null, "emote": "{{emotes}}" or null, "say": "string" or null, "actions": (array of strings) or null }
\`\`\`
`;

export const defaultImageRequest = {
    prompt: "",
    n: 1,
    size: "512x512",
};

export interface StartServerParams {
    port?: number;
    agents: Map<string, IAgentRuntime>;
    startAgent: Function;
    loadCharacterTryPath: Function;
    jsonToCharacter: Function;
}

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

        // Define an interface that extends the Express Request interface
        interface CustomRequest extends ExpressRequest {
            file?: Express.Multer.File;
        }

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

    async start(params: StartServerParams) {
        this.agents = params.agents;
        this.startAgent = params.startAgent;
        this.loadCharacterTryPath = params.loadCharacterTryPath;
        this.jsonToCharacter = params.jsonToCharacter;

        // Refresh routes that depend on agents map after it's populated
        const apiRouter = createApiRouter(this.agents, this);
        const apiLogRouter = createVerifiableLogApiRouter(this.agents);
        const a2aRouter = createA2ARouter(this.agents);

        // Find existing layers and replace them, or add if not present
        const updateRouterLayer = (basePath: string, newRouter: express.Router) => {
            let replaced = false;
            for (let i = 0; i < this.app._router.stack.length; i++) {
                const layer = this.app._router.stack[i];
                // Check if the layer handle identity matches one of the routers we manage
                if (layer.name === 'router' && (layer.handle === apiRouter || layer.handle === apiLogRouter || layer.handle === a2aRouter)) {
                    layer.handle = newRouter;
                    replaced = true;
                    elizaLogger.log(`Updated router layer by handle identity for path matching ${basePath}`);
                    break;
                }
            }
            if (!replaced) {
                // Fallback: Attempt to find by regex if mounting at a known base path (other than '/')
                // Or simply add if no match was found by identity
                elizaLogger.log(`Mounting new router for path ${basePath}`);
                this.app.use(basePath, newRouter);
            }
        };

        updateRouterLayer('/', apiRouter); // Assuming root mount path
        updateRouterLayer('/', apiLogRouter); // Assuming root mount path
        updateRouterLayer('/', a2aRouter); // Assuming root mount path

        const port = params.port || 8080;
        this.server = this.app.listen(port, () => {
            elizaLogger.info(`⚡️[server]: Server is running at http://localhost:${port}`);
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err?: Error) => {
                    if (err) {
                        elizaLogger.error("Error closing server:", err);
                        reject(err);
                    } else {
                        elizaLogger.log("Server stopped");
                        resolve();
                    }
                });
            } else {
                resolve(); // Resolve immediately if server wasn't running
            }
        });
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
