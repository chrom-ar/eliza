// TODO: Implement A2A server logic here
// Import necessary types from A2A specification and eliza actions

// Example using Express (replace if different framework is used)
import express, { Router, Request, Response } from 'express';
import { IAgentRuntime, Content, Memory, stringToUuid, composeContext, generateMessageResponse, ModelClass, getEmbeddingZeroVector,  HandlerCallback } from '@elizaos/core'; // Adjust path as needed
// Removed JWT import: import { tryJWTWithoutError } from './jwt';
import * as fs from 'fs/promises';
import * as path from 'path';
import agentJson from './agentJson';
import { messageHandlerTemplate } from './index'; // Import messageHandlerTemplate
// Import A2A schema types
import {
    Task,
    TaskState,
    Message,
    Part,
    TextPart, // Added TextPart
    Artifact,
    JSONRPCError, // Using JSONRPCError from schema
    ErrorCodeInternalError, // For error codes
    TaskStatus as SchemaTaskStatus, // Rename to avoid conflict with internal usage pattern
    // Add other necessary types from a2a-schema.ts as needed
} from './a2a-schema'; // Assuming a2a-schema.ts is in the same directory

const app = express();
app.use(express.json());

// Define the base path from agent.json
const A2A_BASE_PATH = '/api/a2a';

// Simple in-memory store for task status (Replace with persistent storage for production)
// The Task type now comes from a2a-schema.ts
const taskStore: Map<string, Task> = new Map();

// --- A2A Schema Types ---
// Removed local definitions from here down to --- End A2A Schema Types ---
// --- End A2A Schema Types ---

const uuidv4 = (...args: any[]) => {
  // Simple UUID generation for demonstration
  return stringToUuid(`${args.join('-')}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`);
}

export function createA2ARouter(agents: Map<string, IAgentRuntime>): Router {
  const router = Router();

  // /.well-known/agent.json endpoint
  router.get('/.well-known/agent.json', async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      res.send(agentJson);
    } catch (error) {
      console.error("Error serving agent.json:", error);
      res.status(500).json({ error: 'Could not load agent configuration.' });
    }
  });

  // Single POST endpoint for all A2A methods
  router.post(A2A_BASE_PATH, async (req: Request, res: Response) => {
    const { method, ...body } = req.body;

    console.log(`[A2A] Received POST to ${A2A_BASE_PATH} with method: ${method}`, body, body.params.message.parts);

    if (!method) {
      return res.status(400).json({ error: 'Missing required field: method' });
    }

    // --- Dispatch based on method ---
    switch (method) {
      case 'tasks/send':
        await handleTasksSend(req, res, agents, body.params);
        break;

      case 'tasks/get':
        handleTasksGet(req, res, body.params);
        break;

      // TODO: Add cases for other methods like tasks/cancel, tasks/sendSubscribe etc.

      default:
        res.status(400).json({ error: `Unsupported method: ${method}` });
    }
  });

  return router;
}

// --- Handler Functions ---

async function handleTasksSend(req: Request, res: Response, agents: Map<string, IAgentRuntime>, body: any) {
    // Logic from the original POST /tasks/send handler
    // Use Message type from schema
    const { id: clientTaskId, message: incomingMessage, skillId } = body as { id?: string, message: Message, skillId?: string };

    // Basic Input Validation
    if (!incomingMessage || !Array.isArray(incomingMessage.parts) || incomingMessage.parts.length === 0) {
      console.error('Invalid request: Missing or invalid message parts for tasks/send.', incomingMessage);
        return res.status(400).json({ error: 'Invalid request: Missing or invalid message parts for tasks/send.' });
    }
    // Use TextPart type from schema
    const textPart = incomingMessage.parts.find(p => p.type === 'text') as TextPart | undefined;
    if (!textPart || typeof textPart.text !== 'string') {
        console.error('Invalid request: Missing text part in message for tasks/send.', incomingMessage);
        return res.status(400).json({ error: 'Invalid request: Missing text part in message for tasks/send.' });
    }
    const inputText = textPart.text;

    // Agent & User Identification (FIXME: Needs proper handling)
    const agentId = Array.from(agents.keys())[0];
    if (!agentId) {
        return res.status(500).json({ error: 'No agents available.' });
    }
    const runtime = agents.get(agentId);
    if (!runtime) {
      return res.status(404).json({ error: `Agent with ID ${agentId} not found.` });
    }

    // Use generic user/room IDs since auth is removed
    const userId = stringToUuid('a2a-default-user');
    const userName = 'A2A User';
    const roomId = stringToUuid('a2a-default-room-' + agentId);

    console.log(`[A2A tasks/send] Processing for user: ${userId}, room: ${roomId}`);

    // Task Management
    const id = clientTaskId || uuidv4();
    const now = new Date();
    const nowISO = now.toISOString();
    let task: Task = {
        id: id,
        // Task status is now an object with state and timestamp
        status: { state: 'submitted', timestamp: nowISO },
        // History is not directly part of the Task object in the schema
        // We'll need to manage history separately or adapt if needed.
        // For now, let's store the initial user message for internal logic,
        // but the returned Task won't have a history field like before.
        // history: [ // Removed history from the main Task object
        //     { ...incomingMessage, id: incomingMessage.id || uuidv4(), role: 'user', createdAt: incomingMessage.createdAt || nowISO }
        // ],
        // These timestamps are not directly in the schema Task object
        // createdAt: nowISO,
        // updatedAt: nowISO,
        // Store skillId in metadata if needed
        metadata: skillId ? { skillId: skillId } : undefined,
    };
    // Storing the full history associated with the task ID separately
    const taskHistory: Message[] = [
         { ...incomingMessage, role: 'user' } // Simplified, assuming incomingMessage matches Message structure
    ];

    taskStore.set(id, task);

    try {
        // Update task status object
        task.status = { state: 'working', timestamp: new Date().toISOString() };
        taskStore.set(id, task);

        await runtime.ensureConnection(userId, roomId, userName, runtime.character.name, "a2a-direct");

        const elizaAction = skillId
          ? runtime.actions.find(a => (a as any).skillId === skillId || a.name === skillId || a.similes?.includes(skillId))
          : runtime.actions.find(a => a.name === inputText || a.similes?.includes(inputText));

        const elizaContent: Content = { text: inputText, source: "a2a-direct" };

        const userMessage: Memory = {
            // The schema Message doesn't have a top-level id/messageId in the same way.
            // We'll generate one for the Memory object. The original message parts are in taskHistory[0]
            id: stringToUuid(id + '-user-' + userId), // Use task ID and user ID for uniqueness
            content: elizaContent,
            userId,
            roomId,
            agentId: runtime.agentId,
            createdAt: Date.now(),
        };

        await runtime.messageManager.addEmbeddingToMemory(userMessage);
        await runtime.messageManager.createMemory(userMessage);

        let state = await runtime.composeState(userMessage, { agentName: runtime.character.name });
        let responseContent: Content | null = null;
        // Use Artifact type from schema
        let responseArtifacts: Artifact[] = [];

        if (elizaAction?.handler) {
            console.log(`[A2A tasks/send] Executing action: ${elizaAction.name}`);
            const actionCallback: HandlerCallback = (content: Content | null) => {
                console.log(`[A2A tasks/send] Action ${elizaAction.name} callback:`, content);
                if (content) responseContent = content;
                return Promise.resolve([userMessage]);
            };
            await elizaAction.handler(runtime, userMessage, state, {}, actionCallback);
            console.log('DD a2a.ts:194');
            if (!responseContent) {
              console.log('DD a2a.ts:196');
                responseContent = { text: `Action ${elizaAction.name} executed, but no specific output via callback.` };
            }
        } else {
            console.log(`[A2A tasks/send] No specific action found. Generating generic response.`);
            const context = composeContext({ state, template: messageHandlerTemplate });
            responseContent = await generateMessageResponse({ runtime, context, modelClass: ModelClass.LARGE });
            if (!responseContent) throw new Error("No response from generateMessageResponse");
        }

        console.log('DD a2a.ts:206');
        if (!responseContent) throw new Error("Agent did not produce response content.");

        console.log('DD a2a.ts:209');
        const responseMessageId = uuidv4();
        const responseMemory: Memory = {
            id: stringToUuid(responseMessageId + "-" + runtime.agentId),
            userId: runtime.agentId, roomId, agentId: runtime.agentId, content: responseContent,
            embedding: getEmbeddingZeroVector(), createdAt: Date.now(),
        };
        await runtime.messageManager.createMemory(responseMemory);

        state = await runtime.updateRecentMessageState(state);
        let finalContentFromActions: Content | null = null;
        await runtime.processActions(userMessage, [responseMemory], state, async (newContent) => {
            finalContentFromActions = newContent;
            return [userMessage, responseMemory];
        });
        const finalContent = finalContentFromActions || responseContent;

        // Use Message type from schema
        const agentMessage: Message = {
            // messageId is not part of the schema Message structure
            role: 'agent',
            parts: [],
            // createdAt is not part of the schema Message structure
            // timestamp is part of TaskStatus, not individual messages
        };
        if (finalContent.text) agentMessage.parts.push({ type: 'text', text: finalContent.text });
        // Adapt structured data handling if needed based on schema DataPart
        if ((finalContent as any).structuredData) {
             // Assuming structuredData fits the Record<string, unknown> type
            agentMessage.parts.push({ type: 'data', data: (finalContent as any).structuredData });
        }

        console.log('DD a2a.ts:233');
        // Add agent message to our separate history store
        taskHistory.push(agentMessage);
        // Update task object with artifacts and final status
        task.artifacts = responseArtifacts.length > 0 ? responseArtifacts : undefined;
        task.status = { state: 'completed', timestamp: new Date().toISOString() };
        taskStore.set(id, task);

        console.log('DD a2a.ts:240');
        // Return the final task object as defined by the schema
        // Note: The response structure for tasks/send in A2A is JSONRPCResponse<Task | null, A2AError>
        // We are currently returning the Task directly in the 'result' field.
        res.status(200).json({ jsonrpc: "2.0", id: req.body.id, result: task }); // Align with JSON-RPC response

    } catch (error) {
      console.error(`[A2A tasks/send] Error processing task ${id}:`, error);
      // Update task status object
      task.status = { state: 'failed', timestamp: new Date().toISOString() };
      // Use JSONRPCError structure from schema
      task.error = { code: ErrorCodeInternalError, message: error.message || 'An internal error occurred' };
      taskStore.set(id, task);
      // Send back the failed task object in a JSON-RPC error response structure
      res.status(500).json({
            jsonrpc: "2.0",
            id: req.body.id, // Use request ID for response
            error: {
                code: ErrorCodeInternalError, // Or a more specific A2A error code if applicable
                message: error.message || 'An internal server error occurred processing the task.',
                data: task // Include the task object in the error data field
            }
        });
    }
}

function handleTasksGet(req: Request, res: Response, body: any) {
    // Logic from the original GET /tasks/:id handler
    const { id } = body as { id?: string };

    if (!id) {
        return res.status(400).json({ error: 'Missing required field: id for tasks/get' });
    }

    console.log(`[A2A tasks/get] Received request for task ${id}`);

    const task = taskStore.get(id);

    if (!task) {
      // Return JSON-RPC error format
      return res.status(404).json({
            jsonrpc: "2.0",
            id: req.body.id,
            error: { code: -32001 /* ErrorCodeTaskNotFound */, message: 'Task not found' }
      });
    }

    // No authorization check as authentication is removed
    // Return JSON-RPC success format
     res.status(200).json({ jsonrpc: "2.0", id: req.body.id, result: task });
}

// Note: Server start/stop logic is handled by the main DirectClient in index.ts
