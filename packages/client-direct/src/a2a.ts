// TODO: Implement A2A server logic here
// Import necessary types from A2A specification and eliza actions

// Example using Express (replace if different framework is used)
import express, { Router, Request, Response } from 'express';
import { IAgentRuntime, Content, Memory, stringToUuid, composeContext, generateMessageResponse, ModelClass, getEmbeddingZeroVector,  HandlerCallback } from '@elizaos/core'; // Adjust path as needed
import { tryJWTWithoutError } from './jwt'; // Corrected relative path
import * as fs from 'fs/promises';
import * as path from 'path';
import agentJson from './agentJson';
const app = express();
app.use(express.json());

// Define the base path from agent.json
const A2A_BASE_PATH = '/api/a2a';

// Simple in-memory store for task status (Replace with persistent storage for production)
const taskStore: Map<string, Task> = new Map();

// Define A2A specific types (or import from a schema definition if available)
interface TextPart {
  text: string;
}

interface DataPart {
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
  taskId: string;
  status: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
  messages: A2AMessage[];
  artifacts?: A2AArtifact[];
  createdAt?: string; // ISO 8601 format
  updatedAt?: string; // ISO 8601 format
  error?: { code: string; message: string };
  skillId?: string; // Added skillId to task
}

const uuidv4 = (...args: any[]) => {
  return stringToUuid(`${args.join('-')}-${Date.now()}`);
}

export function createA2ARouter(agents: Map<string, IAgentRuntime>): Router {
  const router = Router();

  // /.well-known/agent.json endpoint
  router.get('/.well-known/agent.json', async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      res.send(agentJson);
    } catch (error) {
      console.error("Error reading agent.json:", error);
      res.status(500).json({ error: 'Could not load agent configuration.' });
    }
  });

  // --- A2A Protocol Endpoints ---

  router.post(`${A2A_BASE_PATH}`, tryJWTWithoutError, async (req: Request, res: Response) => {
    res.status(200).json({ message: 'A2A protocol endpoint received.' });
  });

  // POST /tasks/send
  // Applies JWT Auth middleware
  router.post(`${A2A_BASE_PATH}/tasks/send`, tryJWTWithoutError, async (req: Request, res: Response) => {
    console.log(`[A2A] Received POST request to ${A2A_BASE_PATH}/tasks/send`, req.body);
    // TODO: Validate incoming request body against A2A Task/Message schema
    const { taskId: clientTaskId, message: incomingMessage, skillId } = req.body as { taskId?: string, message: A2AMessage, skillId?: string };

    // --- Basic Input Validation ---
    if (!incomingMessage || !Array.isArray(incomingMessage.parts) || incomingMessage.parts.length === 0) {
        return res.status(400).json({ error: 'Invalid request: Missing or invalid message parts.' });
    }

    const textPart = incomingMessage.parts.find(p => 'text' in p) as TextPart | undefined;
    if (!textPart || typeof textPart.text !== 'string') {
        return res.status(400).json({ error: 'Invalid request: Missing text part in message.' });
    }
    const inputText = textPart.text;

    // --- Agent & User Identification ---
    // Use agentId from path param if available, or maybe from JWT/config?
    // For now, let's assume a default or configured agent if not in path
    // This needs clarification on how the target agent is determined in A2A context
    // Let's hardcode for now, THIS NEEDS TO BE DYNAMIC
    const agentId = Array.from(agents.keys())[0]; // FIXME: Hardcoded agent selection
    if (!agentId) {
        return res.status(500).json({ error: 'No agents available.' });
    }

    const runtime = agents.get(agentId);
    if (!runtime) {
      // This check might be redundant if agentId comes from agents.keys()
      return res.status(404).json({ error: `Agent with ID ${agentId} not found.` });
    }

    // Extract user info from JWT or fallback
    const userId = stringToUuid(req['jwtUserId'] ?? 'a2a-default-user');
    const userName = req['jwtUserName'] ?? 'A2A User'; // Assuming userName might be in JWT
    const roomId = stringToUuid(req['jwtRoomId'] ?? 'a2a-default-room-' + agentId); // Assuming roomId might be in JWT

    console.log(`[A2A] Received POST request to ${A2A_BASE_PATH}/tasks/send with userId: ${userId}, userName: ${userName}, roomId: ${roomId}`);
    console.log(`[A2A] Incoming message:`, incomingMessage);
    console.log(`[A2A] Skill ID: ${skillId}`);
    console.log(`[A2A] Client Task ID: ${clientTaskId}`);
    console.log(`[A2A] Agent ID: ${agentId}`);


    // --- Task Management ---
    const taskId = clientTaskId || uuidv4();
    const now = new Date();
    const nowISO = now.toISOString();

    // Create initial task state
    let task: Task = {
        taskId,
        status: 'submitted',
        messages: [
            { ...incomingMessage, messageId: incomingMessage.messageId || uuidv4(), role: 'user', createdAt: incomingMessage.createdAt || nowISO }
        ],
        createdAt: nowISO,
        updatedAt: nowISO,
        skillId: skillId // Store requested skillId
    };
    taskStore.set(taskId, task); // Store initial task

    try {
        // Update task status to working
        task.status = 'working';
        task.updatedAt = new Date().toISOString();
        taskStore.set(taskId, task);

        await runtime.ensureConnection(userId, roomId, userName, runtime.character.name, "a2a-direct");

        // Find matching Eliza action using skillId first, then name/similes
        const elizaAction = skillId
          ? runtime.actions.find(a => (a as any).skillId === skillId || a.name === skillId || a.similes?.includes(skillId))
          : runtime.actions.find(a => a.name === inputText || a.similes?.includes(inputText));

        const elizaContent: Content = {
            text: inputText,
            source: "a2a-direct",
        };

        const userMessage: Memory = {
            id: stringToUuid(task.messages[0].messageId + '-' + userId), // Use A2A message ID
            content: elizaContent,
            userId,
            roomId,
            agentId: runtime.agentId,
            createdAt: now.getTime(), // Use timestamp
        };

        await runtime.messageManager.addEmbeddingToMemory(userMessage);
        await runtime.messageManager.createMemory(userMessage);

        let state = await runtime.composeState(userMessage, {
            agentName: runtime.character.name,
        });

        let responseContent: Content | null = null;
        let responseArtifacts: A2AArtifact[] = [];

        // --- Execute Action or Generate Response ---
        if (elizaAction?.handler) {
            console.log(`[A2A] Executing action: ${elizaAction.name} for skillId: ${skillId || 'N/A'}`);
            let actionCompleted = false;
            // Wrap the callback to capture the result
            const actionCallback: HandlerCallback = (content: Content | null) => {
                console.log(`[A2A] Action ${elizaAction.name} callback received:`, content);
                if (content) {
                    responseContent = content; // Capture the primary response content
                    // TODO: Map potential structured data/attachments in content to A2A Artifacts
                    // Example: if (content.structuredData) responseArtifacts.push({ parts: [{ data: content.structuredData }] });
                }
                actionCompleted = true;
                return Promise.resolve([userMessage]); // Fulfill callback promise
            };

            // Execute the action handler
            // TODO: Actions return value is not currently normalized (most of the time is false)
            await elizaAction.handler(runtime, userMessage, state, {}, actionCallback);

            if (!responseContent) {
              responseContent = { text: `Action ${elizaAction.name} executed, but produced no specific output via callback.` };
            }
             console.log(`[A2A] Action execution finished for: ${elizaAction.name}. Response content:`, responseContent);

        } else {
            console.log(`[A2A] No specific action found for skillId "${skillId}" or text "${inputText}". Generating generic response.`);
            const context = composeContext({
                state,
                template: messageHandlerTemplate,
            });
            responseContent = await generateMessageResponse({
                runtime: runtime,
                context,
                modelClass: ModelClass.LARGE,
            });
            if (!responseContent) {
                throw new Error("No response from generateMessageResponse");
            }
             console.log("[A2A] Generated response:", responseContent);
        }

        // --- Process Eliza Response ---
        if (!responseContent) {
             throw new Error("Agent did not produce a response content.");
        }

        const responseMessageId = uuidv4();
        // Save response to Eliza's memory
        const responseMemory: Memory = {
            id: stringToUuid(responseMessageId + "-" + runtime.agentId),
            userId: runtime.agentId,
            roomId,
            agentId: runtime.agentId,
            content: responseContent,
            embedding: getEmbeddingZeroVector(), // Assuming no specific embedding for now
            createdAt: Date.now(),
        };
        await runtime.messageManager.createMemory(responseMemory);

        // Optionally run processActions if needed for side effects or further processing
        state = await runtime.updateRecentMessageState(state);
        let finalContentFromActions: Content | null = null;
        await runtime.processActions(
            userMessage, // context message
            [responseMemory], // messages to process
            state,
            async (newContent) => { // callback with result
                finalContentFromActions = newContent;
                // TODO: Map potential structured data/attachments in newContent to A2A Artifacts
                return [userMessage, responseMemory];
            }
        );

         // Use content from processActions if available, otherwise use the generated/simulated one
         const finalContent = finalContentFromActions || responseContent;


        // --- Format Response for A2A ---
        const agentMessage: A2AMessage = {
            messageId: responseMessageId,
            role: 'agent',
            parts: [], // We will populate this based on finalContent
            createdAt: new Date(responseMemory.createdAt).toISOString()
        };

        // Map Eliza Content to A2A Parts
        if (finalContent.text) {
            agentMessage.parts.push({ text: finalContent.text });
        }
        // TODO: Add mapping for attachments, structured data (intents) etc. to DataPart or FilePart
        // Example: if (finalContent.structuredData) agentMessage.parts.push({ data: finalContent.structuredData });

        task.messages.push(agentMessage);
        task.artifacts = responseArtifacts.length > 0 ? responseArtifacts : undefined;
        task.status = 'completed'; // TODO: Determine if 'input-required' is needed based on response/action
        task.updatedAt = new Date().toISOString();
        taskStore.set(taskId, task); // Update final task state

        res.status(200).json(task);

    } catch (error) {
      console.error(`[A2A] Error processing task ${taskId}:`, error);
      // Update task status to failed
      task.status = 'failed';
      task.error = { code: 'INTERNAL_ERROR', message: error.message || 'An internal error occurred' };
      task.updatedAt = new Date().toISOString();
      taskStore.set(taskId, task);
      res.status(500).json({ error: 'Failed to process task.', taskId: taskId });
    }
  });

  // GET /tasks/{taskId}
  // Applies JWT Auth middleware
  router.get(`${A2A_BASE_PATH}/tasks/:taskId`, tryJWTWithoutError, (req, res) => {
    const { taskId } = req.params;
    const userId = req['jwtUserId']; // Get user ID from JWT for potential authorization check

    console.log(`[A2A] Received get request for task ${taskId} by user ${userId}`);

    const task = taskStore.get(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Optional: Add authorization check - does userId have permission to view this task?
    // This requires associating tasks with users/sessions, which our simple store doesn't do yet.

    res.status(200).json(task);
  });

  // TODO: Implement other A2A endpoints (tasks/sendSubscribe, tasks/cancel, etc.)

  return router;
}

// --- Server Start --- 
// This might be integrated differently depending on how eliza starts its services
// const PORT = process.env.A2A_PORT || 3001; // Example port
// app.listen(PORT, () => {
//   console.log(`A2A compatible server listening on port ${PORT}`);
//   console.log(`Agent Card potentially available at /.well-known/agent.json`);
//   console.log(`A2A API endpoint base: ${A2A_BASE_PATH}`);
// });

// Export the app or start logic if needed for integration
// export default app; 