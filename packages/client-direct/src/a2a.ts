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

const app = express();
app.use(express.json());

// Define the base path from agent.json
const A2A_BASE_PATH = '/api/a2a';

// Simple in-memory store for task status (Replace with persistent storage for production)
const taskStore: Map<string, Task> = new Map();

// Define A2A specific types (or import from a schema definition if available)
interface TextPart {
  type: 'text';
  text: string;
}

interface DataPart {
  type: 'data';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

type Part = TextPart | DataPart; // Add FilePart etc. if needed

interface A2AMessage {
  messageId?: string;
  role: 'user' | 'agent';
  parts: Part[];
  createdAt?: string; // ISO 8601 format
}

interface A2AArtifact {
   artifactId?: string;
   parts: Part[];
   createdAt?: string; // ISO 8601 format
}

interface Task {
  id: string;
  status: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
  history: A2AMessage[];
  artifacts?: A2AArtifact[];
  createdAt?: string; // ISO 8601 format
  updatedAt?: string; // ISO 8601 format
  error?: { code: string; message: string };
  skillId?: string; // Added skillId to task
}

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
    const { id: clientTaskId, message: incomingMessage, skillId } = body as { id?: string, message: A2AMessage, skillId?: string };

    // Basic Input Validation
    if (!incomingMessage || !Array.isArray(incomingMessage.parts) || incomingMessage.parts.length === 0) {
      console.error('Invalid request: Missing or invalid message parts for tasks/send.', incomingMessage);
        return res.status(400).json({ error: 'Invalid request: Missing or invalid message parts for tasks/send.' });
    }
    const textPart = incomingMessage.parts.find(p => 'text' in p) as TextPart | undefined;
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
        status: 'submitted',
        history: [
            { ...incomingMessage, messageId: incomingMessage.messageId || uuidv4(), role: 'user', createdAt: incomingMessage.createdAt || nowISO }
        ],
        createdAt: nowISO,
        updatedAt: nowISO,
        skillId: skillId
    };
    taskStore.set(id, task);

    try {
        task.status = 'working';
        task.updatedAt = new Date().toISOString();
        taskStore.set(id, task);

        await runtime.ensureConnection(userId, roomId, userName, runtime.character.name, "a2a-direct");

        const elizaAction = skillId
          ? runtime.actions.find(a => (a as any).skillId === skillId || a.name === skillId || a.similes?.includes(skillId))
          : runtime.actions.find(a => a.name === inputText || a.similes?.includes(inputText));

        const elizaContent: Content = { text: inputText, source: "a2a-direct" };

        const userMessage: Memory = {
            id: stringToUuid(task.history[0].messageId + '-' + userId),
            content: elizaContent,
            userId,
            roomId,
            agentId: runtime.agentId,
            createdAt: now.getTime(),
        };

        await runtime.messageManager.addEmbeddingToMemory(userMessage);
        await runtime.messageManager.createMemory(userMessage);

        let state = await runtime.composeState(userMessage, { agentName: runtime.character.name });
        let responseContent: Content | null = null;
        let responseArtifacts: A2AArtifact[] = [];

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

        const agentMessage: A2AMessage = {
            messageId: responseMessageId, role: 'agent',
            parts: [], createdAt: new Date(responseMemory.createdAt).toISOString()
        };
        if (finalContent.text) agentMessage.parts.push({ type: 'text', text: finalContent.text });
        if ((finalContent as any).structuredData) agentMessage.parts.push({ type: 'data', data: (finalContent as any).structuredData });

        console.log('DD a2a.ts:233');
        task.history.push(agentMessage);
        task.artifacts = responseArtifacts.length > 0 ? responseArtifacts : undefined;
        task.status = 'completed';
        task.updatedAt = new Date().toISOString();
        taskStore.set(id, task);

        console.log('DD a2a.ts:240');
        res.status(200).json({id: id, result: task});

    } catch (error) {
      console.error(`[A2A tasks/send] Error processing task ${id}:`, error);
      task.status = 'failed';
      task.error = { code: 'INTERNAL_ERROR', message: error.message || 'An internal error occurred' };
      task.updatedAt = new Date().toISOString();
      taskStore.set(id, task);
      // Send back the failed task object even on error
      res.status(500).json(task);
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
      return res.status(404).json({ error: 'Task not found' });
    }

    // No authorization check as authentication is removed
    res.status(200).json(task);
}

// Note: Server start/stop logic is handled by the main DirectClient in index.ts
