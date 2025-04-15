import {
    composeContext,
    elizaLogger,
    generateCaption,
    generateImage,
    generateMessageResponse,
    generateObject,
    getEmbeddingZeroVector,
    messageCompletionFooter,
    ModelClass,
    settings,
    stringToUuid,
    type AgentRuntime,
    type Client,
    type Content,
    type IAgentRuntime,
    type Media,
    type Memory,
    type Plugin,
} from "@elizaos/core";
import bodyParser from "body-parser";
import cors from "cors";
import express, { type Request as ExpressRequest } from "express";
import * as fs from "fs";
import multer from "multer";
import OpenAI from "openai";
import * as path from "path";
import { z } from "zod";
import { createApiRouter } from "./api.ts";
import { createVerifiableLogApiRouter } from "./verifiable-log-api.ts";
import { tryJWTWithoutError } from "./jwt.ts";

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

        // Define an interface that extends the Express Request interface
        interface CustomRequest extends ExpressRequest {
            file?: Express.Multer.File;
        }

        // Update the route handler to use CustomRequest instead of express.Request
        // this.app.post(
        //     "/:agentId/whisper",
        //     upload.single("file"),
        //     async (req: CustomRequest, res: express.Response) => {
        //         const audioFile = req.file; // Access the uploaded file using req.file
        //         const agentId = req.params.agentId;

        //         if (!audioFile) {
        //             res.status(400).send("No audio file provided");
        //             return;
        //         }

        //         let runtime = this.agents.get(agentId);
        //         const apiKey = runtime.getSetting("OPENAI_API_KEY");

        //         // if runtime is null, look for runtime with the same name
        //         if (!runtime) {
        //             runtime = Array.from(this.agents.values()).find(
        //                 (a) =>
        //                     a.character.name.toLowerCase() ===
        //                     agentId.toLowerCase()
        //             );
        //         }

        //         if (!runtime) {
        //             res.status(404).send("Agent not found");
        //             return;
        //         }

        //         const openai = new OpenAI({
        //             apiKey,
        //         });

        //         const transcription = await openai.audio.transcriptions.create({
        //             file: fs.createReadStream(audioFile.path),
        //             model: "whisper-1",
        //         });

        //         res.json(transcription);
        //     }
        // );

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
                console.log('DD index.ts:227');

                const reqAction = req.body.action && runtime.actions.find((a) => a.name === req.body.action);
                console.log('DD index.ts:230');
                const text = req.body.text || req.body.action;


                console.log('DD index.ts:234', req.body, req.params);
                console.log('DD index.ts:233', req.body.text, req.body.action, !text && !reqAction);
                if (!text && !reqAction) {
                    console.log('DD index.ts:235');
                    res.json([]);
                    return;
                }

                console.log('DD index.ts:240');
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

                console.log('DD index.ts:276');

                let state = await runtime.composeState(userMessage, {
                    agentName: runtime.character.name,
                });

                let response;

                console.log('DD index.ts:284');
                // Use requested action
                if (reqAction) {
                    console.log('DD index.ts:287');
                    response = {
                        text:   text,
                        action: reqAction.name,
                    }
                // Compose the message from text
                } else {
                    console.log('DD index.ts:296');
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

                console.log('DD index.ts:316');
                // save response to memory
                const responseMessage: Memory = {
                    id: stringToUuid(messageId + "-" + runtime.agentId),
                    ...userMessage,
                    userId: runtime.agentId,
                    content: response,
                    embedding: getEmbeddingZeroVector(),
                    createdAt: Date.now(),
                };

                console.log('DD index.ts:327');
                await runtime.messageManager.createMemory(responseMessage);

                state = await runtime.updateRecentMessageState(state);

                let message = null as Content | null;

                console.log('DD index.ts:334');
                await runtime.processActions(
                    memory,
                    [responseMessage],
                    state,
                    async (newMessages) => {
                        message = newMessages;
                        return [memory];
                    }
                );

                console.log('DD index.ts:345');
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
