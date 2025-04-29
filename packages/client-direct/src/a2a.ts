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
    ErrorCodeTaskNotFound,
} from './a2a-schema'; // Assuming a2a-schema.ts is in the same directory
import { setImmediate } from 'timers'; // Import setImmediate for scheduling background task

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
      return res.status(400).json({
        jsonrpc: "2.0", id: req.body.id, error: { code: -32600, message: 'Missing required field: method' }
      });
    }

    // --- Dispatch based on method ---
    switch (method) {
      case 'tasks/send':
        // No await here - handleTasksSend now responds immediately and processes in background
        handleTasksSend(req, res, agents, body.params);
        break;

      case 'tasks/get':
        handleTasksGet(req, res, body.params);
        break;

      // TODO: Add cases for other methods like tasks/cancel, tasks/sendSubscribe etc.

      default:
         res.status(400).json({
           jsonrpc: "2.0", id: req.body.id, error: { code: -32601, message: `Unsupported method: ${method}` }
         });
    }
  });

  return router;
}

// --- Handler Functions ---

// Renamed original function slightly to avoid conflict if needed, and made it non-async regarding the response
function handleTasksSend(req: Request, res: Response, agents: Map<string, IAgentRuntime>, body: any) {
    // Logic from the original POST /tasks/send handler, adapted for immediate response
    const { id: clientTaskId, message: incomingMessage, skillId } = body as { id?: string, message: Message, skillId?: string };

    // Basic Input Validation
    if (!incomingMessage || !Array.isArray(incomingMessage.parts) || incomingMessage.parts.length === 0) {
      console.error('Invalid request: Missing or invalid message parts for tasks/send.', incomingMessage);
        // Ensure response is JSON-RPC compliant
        return res.status(400).json({
            jsonrpc: "2.0",
            id: req.body.id,
            error: { code: -32602, message: 'Invalid request: Missing or invalid message parts for tasks/send.' }
        });
    }
    const textPart = incomingMessage.parts.find(p => p.type === 'text') as TextPart | undefined;
    if (!textPart || typeof textPart.text !== 'string') {
        console.error('Invalid request: Missing text part in message for tasks/send.', incomingMessage);
        // Ensure response is JSON-RPC compliant
        return res.status(400).json({
            jsonrpc: "2.0",
            id: req.body.id,
            error: { code: -32602, message: 'Invalid request: Missing text part in message for tasks/send.' }
        });
    }
    const inputText = textPart.text;

    // Agent & User Identification
    // FIXME: Use actual agent/skill routing if multiple agents/skills are relevant
    const agentId = Array.from(agents.keys())[0];
    if (!agentId) {
        console.error('[A2A tasks/send] No agents available.');
        return res.status(500).json({
             jsonrpc: "2.0", id: req.body.id, error: { code: ErrorCodeInternalError, message: 'No agents available.' }
        });
    }
    const runtime = agents.get(agentId);
    if (!runtime) {
        console.error(`[A2A tasks/send] Agent with ID ${agentId} not found.`);
        return res.status(404).json({
             jsonrpc: "2.0", id: req.body.id, error: { code: ErrorCodeInternalError, message: `Agent with ID ${agentId} not found.` }
        });
    }

    // Use generic user/room IDs since auth is removed
    const userId = stringToUuid('a2a-default-user');
    const userName = 'A2A User';
    const roomId = stringToUuid('a2a-default-room-' + agentId);

    console.log(`[A2A tasks/send] Preparing task for user: ${userId}, room: ${roomId}`);

    // Task Management - Create Task
    const id = clientTaskId || uuidv4();
    const now = new Date();
    const nowISO = now.toISOString();
    let task: Task = {
        id: id,
        status: { state: 'submitted', timestamp: nowISO }, // Initial state
        metadata: skillId ? { skillId: skillId } : undefined,
    };
    const taskHistory: Message[] = [
         { ...incomingMessage, role: 'user' } // Start history with the user message
    ];
    taskStore.set(id, { ...task }); // Store the initial submitted task state

    // Pre-calculate elizaAction to pass to background task
    const elizaAction = skillId
        ? runtime.actions.find(a => (a as any).skillId === skillId || a.name === skillId || a.similes?.includes(skillId))
        : runtime.actions.find(a => a.name === inputText || a.similes?.includes(inputText));


    try {
        // Update task status to working
        task.status = { state: 'working', timestamp: new Date().toISOString() };
        taskStore.set(id, { ...task }); // Update store with working task

        // Respond immediately with the 'working' task status
        console.log(`[A2A tasks/send] Responding with 'working' status for task ${id}`);
        res.status(200).json({ jsonrpc: "2.0", id: req.body.id, result: task });

        // --- Schedule background processing ---
        // Use setImmediate to ensure the response is sent before heavy processing begins
        setImmediate(() => {
             // Pass only necessary data to the background task
             processTaskInBackground(
                 runtime,
                 id, // Pass ID instead of the whole task object initially
                 userId,
                 roomId,
                 userName,
                 inputText,
                 incomingMessage, // Pass original message if needed for context/history
                 taskHistory, // Pass the initial history array
                 elizaAction // Pass the pre-calculated action
             ).catch(backgroundError => {
                 // Catch unhandled errors from the background process itself (should be rare if internal try/catch is good)
                 console.error(`[A2A Background] Unhandled error for task ${id}:`, backgroundError);
                 // Attempt to update task status to failed if it's still working
                 const currentTask = taskStore.get(id);
                 if (currentTask && currentTask.status.state === 'working') {
                     const errorMessage: Message = { role: 'agent', parts: [{ type: 'text', text: `Critical background error: ${backgroundError.message}`}]};
                     currentTask.status = { state: 'failed', timestamp: new Date().toISOString(), message: errorMessage };
                     taskStore.set(id, currentTask);
                 }
             });
        });
        // --- Background processing scheduled ---

    } catch (error) {
      // This catch block handles errors during the *synchronous* part:
      // task creation, status update to 'working', scheduling the background task, or sending the response.
      console.error(`[A2A tasks/send] Error during initial setup/response for task ${id}:`, error);

      // If headers haven't been sent, we can send an error response.
      if (!res.headersSent) {
           // Update task state to failed if possible (it might not have been stored yet)
           const failedTask = taskStore.get(id);
           if (failedTask) {
                failedTask.status = { state: 'failed', timestamp: new Date().toISOString() };
                // Add error message if desired, e.g., in metadata or status.message
                taskStore.set(id, failedTask);
           }
           res.status(500).json({
                jsonrpc: "2.0",
                id: req.body.id,
                error: {
                    code: ErrorCodeInternalError,
                    message: error.message || 'An internal server error occurred during task initiation.',
                    // data: task // Avoid sending potentially partial task data
                }
            });
       } else {
           // Response was already sent (likely 'working' status).
           // Log the error. The background task might not have been scheduled.
           // Mark the task as failed in the store because processing cannot proceed.
            console.error(`[A2A tasks/send] Error occurred after sending 'working' response for task ${id}. Attempting to mark as failed.`);
            const currentTask = taskStore.get(id);
            if (currentTask && currentTask.status.state === 'working') {
                 const errorMessage: Message = { role: 'agent', parts: [{ type: 'text', text: `Error during task setup: ${error.message}`}]};
                 currentTask.status = { state: 'failed', timestamp: new Date().toISOString(), message: errorMessage };
                 taskStore.set(id, currentTask);
            }
       }
    }
}

// --- Background Task Processing ---

async function processTaskInBackground(
    runtime: IAgentRuntime,
    taskId: string,
    userId: string,
    roomId: string,
    userName: string,
    inputText: string,
    incomingMessage: Message, // Original user message from request
    taskHistory: Message[], // History array, starting with user message
    elizaAction: any // Pre-calculated action
) {
    console.log(`[A2A Background] Starting processing for task ${taskId}`);
    // Fetch the task state, expecting it to be 'working'
    let task = taskStore.get(taskId);
    if (!task || task.status.state !== 'working') {
        console.warn(`[A2A Background] Task ${taskId} not found or not in 'working' state (current: ${task?.status?.state}). Aborting background process.`);
        return; // Avoid processing if task is missing or already completed/failed/canceled
    }

    try {
        // Ensure connection (idempotent)
        await runtime.ensureConnection(userId, roomId, userName, runtime.character.name, "a2a-direct");

        // Prepare user message for Eliza Core Memory
        const elizaContent: Content = { text: inputText, source: "a2a-direct" };
        const userMessage: Memory = {
            id: stringToUuid(taskId + '-user-' + userId),
            content: elizaContent,
            userId,
            roomId,
            agentId: runtime.agentId,
            createdAt: Date.now(),
        };

        // Add user message to memory. addEmbeddingToMemory might be redundant if createMemory handles it.
        // await runtime.messageManager.addEmbeddingToMemory(userMessage);
        await runtime.messageManager.createMemory(userMessage);

        // Compose initial state
        let state = await runtime.composeState(userMessage, { agentName: runtime.character.name });
        let responseContent: Content | null = null;
        let responseArtifacts: Artifact[] = []; // Initialize artifacts collector

        // --- Execute Action or Generate Response ---
        if (elizaAction?.handler) {
            console.log(`[A2A Background] Executing action: ${elizaAction.name} for task ${taskId}`);
            // Adapt callback if actions need to produce A2A Artifacts
            const actionCallback: HandlerCallback = async (content: Content | null /*, artifacts?: Artifact[] */) => {
                console.log(`[A2A Background] Action ${elizaAction.name} callback for task ${taskId}:`, content);
                if (content) responseContent = content;
                // if (artifacts) responseArtifacts.push(...artifacts); // Collect artifacts
                return [userMessage]; // Return relevant messages for core processing
            };
            await elizaAction.handler(runtime, userMessage, state, {}, actionCallback);
            if (!responseContent) {
                // Provide a default response if action completes without explicit output via callback
                responseContent = { text: `Action ${elizaAction.name} completed.` };
            }
        } else {
            console.log(`[A2A Background] No specific action found for task ${taskId}. Generating generic response.`);
            const context = composeContext({ state, template: messageHandlerTemplate }); // Use imported template
            responseContent = await generateMessageResponse({ runtime, context, modelClass: ModelClass.LARGE });
            // TODO: Extract artifacts from responseContent if applicable
        }

        if (!responseContent) {
            throw new Error("Agent did not produce response content after action/generation.");
        }

        // --- Process Agent Response ---
        const responseMessageId = uuidv4();
        const responseMemory: Memory = {
            id: stringToUuid(responseMessageId + "-" + runtime.agentId),
            userId: runtime.agentId, roomId, agentId: runtime.agentId, content: responseContent,
            embedding: getEmbeddingZeroVector(), // Assuming zero vector is appropriate here
            createdAt: Date.now(),
        };
        await runtime.messageManager.createMemory(responseMemory);

        // --- Post-Response Processing (e.g., triggered function calls by LLM) ---
        state = await runtime.updateRecentMessageState(state);
        let finalContentFromActions: Content | null = null;
        await runtime.processActions(userMessage, [responseMemory], state, async (newContent) => {
            finalContentFromActions = newContent;
            // TODO: Handle/collect artifacts generated during processActions
            return [userMessage, responseMemory]; // Return messages for core processing
        });
        const finalContent = finalContentFromActions || responseContent; // Use action result or initial response

        // --- Format Final Agent Message for A2A ---
        const agentMessage: Message = {
            role: 'agent',
            parts: [],
            // metadata: { timestamp: new Date().toISOString() } // Metadata isn't standard on Message, put timestamp in TaskStatus
        };
        if (finalContent.text) {
            agentMessage.parts.push({ type: 'text', text: finalContent.text });
        }
        if ((finalContent as any).structuredData) {
            // Ensure structuredData fits Record<string, unknown>
            agentMessage.parts.push({ type: 'data', data: (finalContent as any).structuredData });
        }
        // TODO: Convert any other finalContent parts (images, files) into A2A Parts (FilePart, etc.)
        // TODO: Populate responseArtifacts based on finalContent or collected artifacts

        // Add agent message to history (optional, as it's also in final status)
        // taskHistory.push(agentMessage);

        // --- Update Task to Completed ---
        task = taskStore.get(taskId); // Re-fetch task before update
        if (task && task.status.state === 'working') {
             task.artifacts = responseArtifacts.length > 0 ? responseArtifacts : undefined; // Set collected artifacts
             task.status = {
                 state: 'completed',
                 timestamp: new Date().toISOString(),
                 message: agentMessage // Include the final agent message in the status
             };
             taskStore.set(taskId, task);
             console.log(`[A2A Background] Task ${taskId} completed successfully.`);
        } else {
             // Log if the task was not 'working' anymore (e.g., canceled)
             console.warn(`[A2A Background] Task ${taskId} was not in 'working' state (current: ${task?.status?.state}) when trying to mark as completed.`);
        }

    } catch (error) {
      console.error(`[A2A Background] Error processing task ${taskId}:`, error);
      // --- Update Task to Failed ---
      task = taskStore.get(taskId); // Re-fetch task before update
      if (task && task.status.state === 'working') { // Check state again before marking failed
          const errorMessage: Message = {
              role: 'agent',
              parts: [{ type: 'text', text: `Error processing task: ${error.message || 'Internal error'}` }],
              // metadata: { error: true, timestamp: new Date().toISOString() } // Metadata not standard on Message
          };
          task.status = {
              state: 'failed',
              timestamp: new Date().toISOString(),
              message: errorMessage // Include error details in the status message
          };
          // task.artifacts = undefined; // Clear any potentially partial artifacts
          taskStore.set(taskId, task);
          console.log(`[A2A Background] Task ${taskId} status updated to 'failed'.`);
       } else {
           // Log if the task was not 'working' anymore
           console.warn(`[A2A Background] Task ${taskId} was not in 'working' state (current: ${task?.status?.state}) when trying to mark as failed.`);
       }
    }
}


function handleTasksGet(req: Request, res: Response, body: any) {
    // Logic from the original GET /tasks/:id handler
    const { id } = body as { id?: string };

    if (!id) {
         return res.status(400).json({
             jsonrpc: "2.0", id: req.body.id, error: { code: -32602, message: 'Missing required field: id for tasks/get' }
         });
    }

    console.log(`[A2A tasks/get] Received request for task ${id}`);

    const task = taskStore.get(id);

    if (!task) {
      // Return JSON-RPC error format
      return res.status(404).json({
            jsonrpc: "2.0",
            id: req.body.id,
            error: { code: ErrorCodeTaskNotFound , message: 'Task not found' } // Use defined error code
      });
    }

    // No authorization check as authentication is removed
    // Return JSON-RPC success format
    res.status(200).json({ jsonrpc: "2.0", id: req.body.id, result: task });
}