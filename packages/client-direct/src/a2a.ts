import { Router, Request, Response } from 'express';
import { IAgentRuntime, Content, Memory, stringToUuid, composeContext, generateMessageResponse, ModelClass, HandlerCallback, Uuid } from '@elizaos/core'; // Adjust path as needed
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
    ErrorCodeInternalError, // For error codes
    TaskStatus as SchemaTaskStatus, // Rename to avoid conflict with internal usage pattern
    // Add other necessary types from a2a-schema.ts as needed
    ErrorCodeTaskNotFound,
    ErrorCodeMethodNotFound,
    ErrorCodeInvalidRequest,
    ErrorCodeInvalidParams,
    TaskStatusUpdateEvent,
    TaskArtifactUpdateEvent,
    ErrorCodeTaskNotCancelable, // Added for tasks/cancel
} from './a2a-schema'; // Assuming a2a-schema.ts is in the same directory
import { EventEmitter } from 'events'; // For cancellation

// Define the base path from agent.json
const A2A_BASE_PATH = '/a2a';

// Simple in-memory store for task status (Replace with persistent storage for production)
// The Task type now comes from a2a-schema.ts
const taskStore: Map<string, Task> = new Map();

const uuidv4 = (): Uuid => {
  // Simple UUID generation for demonstration
  return stringToUuid(`${Date.now()}-${Math.random().toString(36).substring(2, 15)}`);
}

// --- Task Store and Cancellation Management ---
const taskCancellationEmitters: Map<string, EventEmitter> = new Map(); // To signal cancellation

// --- Utility Types based on A2A Example ---

// Represents an update yielded by the task handler generator
type TaskYieldUpdate =
    | Omit<SchemaTaskStatus, 'timestamp'> // Update status (state, message)
    | (Omit<Artifact, 'index' | 'append' | 'lastChunk'> & { type: 'artifact' }) // Yield an artifact
    | { type: 'error', error: Error }; // Yield an error

// Context passed to the task handler
interface TaskContext {
    task: Task; // The initial task object
    incomingMessage: Message; // The user's message
    cancellationEmitter: EventEmitter; // Emitter to listen for cancellation
    isCancelled: () => boolean; // Function to check cancellation status
    userId?: string; // Optional user ID
}

// Type for the async generator function that handles the task logic
type TaskHandler = (context: TaskContext) => AsyncGenerator<TaskYieldUpdate, void, void>;

// --- Main Eliza Task Handler Logic (Async Generator) ---

const elizaTaskHandler: TaskHandler = async function* (context: TaskContext): AsyncGenerator<TaskYieldUpdate, void, void> {
    const { task: initialTask, incomingMessage, cancellationEmitter, isCancelled } = context;
    const taskId = initialTask.id;
    const skillId = initialTask.metadata?.skillId as string | undefined;

    // --- Find Agent Runtime (Assuming single agent for now) ---
    // In a multi-agent setup, the runtime would be determined based on skillId or other routing logic
    let runtime: IAgentRuntime | undefined;
    // Placeholder: Need access to the 'agents' map here. This structure might need adjustment
    // Option 1: Pass 'agents' map to the handler (complex)
    // Option 2: Refactor routing to select agent *before* calling handler
    // Option 3: For now, assume a global way to get the runtime (not ideal)
    // Let's simulate getting the first agent's runtime
    // This part NEEDS to be refactored for proper agent routing if multiple agents exist.
    const agentsMapFromSomewhere = getAgentsMap(); // Needs implementation
    const agentId = Array.from(agentsMapFromSomewhere.keys())[0];
    runtime = agentsMapFromSomewhere.get(agentId);

    if (!runtime) {
        console.error(`[Task Handler ${taskId}] Could not find runtime.`);
        yield { type: 'error', error: new Error('Agent runtime not found.') };
        return;
    }
    const agentIdUuid = runtime.agentId;

    // --- User/Room Setup ---
    const textPart = incomingMessage.parts.find(p => p.type === 'text') as TextPart | undefined;
    if (!textPart?.text) {
        yield { type: 'error', error: new Error('Missing text part in incoming message.') };
        return;
    }
    const inputText = textPart.text;
    const userId = stringToUuid(context.userId || 'a2a-user');
    const userName = 'A2A User';
    const roomId = stringToUuid(`a2a-room-${userId}`); // Room associated with the agent

    try {
        yield { state: 'working', message: { role: 'agent', parts: [{ type: 'text', text: "Initializing..." }] } };

        // --- Check for Cancellation Early ---
        if (isCancelled()) {
            yield { state: 'canceled' };
            return;
        }

        await runtime.ensureConnection(userId, roomId, userName, userName, "a2a-direct");

        // --- Prepare Eliza Core Input ---
        const elizaAction = skillId
            ? runtime.actions.find(a => (a as any).skillId === skillId || a.name === skillId || a.similes?.includes(skillId))
            : runtime.actions.find(a => a.name === inputText.toUpperCase() || a.similes?.includes(inputText.toUpperCase()));

        const elizaContent: Content = { text: inputText, source: "a2a-direct" };
        const userMemory: Memory = {
            id: stringToUuid(`${taskId}-user-${userId}`),
            content: elizaContent, userId, roomId, agentId: agentIdUuid, createdAt: Date.now(),
        };
        await runtime.messageManager.addEmbeddingToMemory(userMemory);
        await runtime.messageManager.createMemory(userMemory);

        yield { state: 'working', message: { role: 'agent', parts: [{ type: 'text', text: "Processing request..." }] } };

        // --- Check for Cancellation During Processing ---
        if (isCancelled()) {
            yield { state: 'canceled' };
            return;
        }

        // --- Execute Logic (Action or Generation) ---
        let state = await runtime.composeState(userMemory, { agentName: runtime.character.name });
        let responseContent: Content | null = null;

        if (elizaAction?.handler) {
            console.log(`[Task Handler ${taskId}] Executing action: ${elizaAction.name}`);
            yield { state: 'working', message: { role: 'agent', parts: [{ type: 'text', text: `Executing action: ${elizaAction.name}...` }] } };

            responseContent = { text: inputText, action: elizaAction.name, user: 'a2a-direct' };
        } else {
            console.log(`[Task Handler ${taskId}] No specific action found. Generating generic response.`);
            yield { state: 'working', message: { role: 'agent', parts: [{ type: 'text', text: "Generating response..." }] } };
            if (isCancelled()) { yield { state: 'canceled' }; return; } // Check again before LLM call
            const context = composeContext({ state, template: messageHandlerTemplate });

            responseContent = await generateMessageResponse({ runtime, context, modelClass: ModelClass.LARGE });
        }

        // --- Check for Cancellation After Main Logic ---
        if (isCancelled()) {
            yield { state: 'canceled' };
            return;
        }
        if (!responseContent) {
            throw new Error("Agent did not produce response content.");
        }

        // --- Process Agent Response & Post-Processing ---
        const responseMemory: Memory = await runtime.messageManager.addEmbeddingToMemory({
            id: uuidv4(), userId: agentIdUuid, roomId, agentId: agentIdUuid, content: responseContent,
            createdAt: Date.now(),
        });
        await runtime.messageManager.createMemory(responseMemory);

        state = await runtime.updateRecentMessageState(state);
        let finalContentFromActions: Content | null = null;
        await runtime.processActions(userMemory, [responseMemory], state, async (newContent) => {
            if (isCancelled()) return [userMemory]; // Stop if cancelled
            finalContentFromActions = newContent;
            // TODO: Handle/collect artifacts generated during processActions
            // yield { type: 'artifact', ... someArtifact };
            return [userMemory];
        });
        await runtime.evaluate(userMemory, state);

        const finalContent = finalContentFromActions || responseContent;

        // --- Final Check for Cancellation ---
        if (isCancelled()) {
            yield { state: 'canceled' };
            return;
        }

        // --- Format Final Agent Message and Yield ---
        const agentMessage: Message = { role: 'agent', parts: [] };
        if (finalContent.text) agentMessage.parts.push({ type: 'text', text: finalContent.text });
        if ((finalContent as any).structuredData) agentMessage.parts.push({ type: 'data', data: (finalContent as any).structuredData });

        yield { state: 'completed', message: agentMessage };

    } catch (error) {
        console.error(`[Task Handler ${taskId}] Error:`, error);
        yield { type: 'error', error: error };
    } finally {
        // Clean up cancellation listener
        cancellationEmitter.removeAllListeners('cancel');
        taskCancellationEmitters.delete(taskId);
        console.log(`[Task Handler ${taskId}] Processing finished.`);
    }
};

// --- Router Setup ---

// Placeholder - This needs to be accessible by the task handler.
// Ideally, pass it during router creation or use a context/DI pattern.
let globalAgentsMap: Map<string, IAgentRuntime> | null = null;
function getAgentsMap(): Map<string, IAgentRuntime> {
    if (!globalAgentsMap) throw new Error("Agents Map not initialized");
    return globalAgentsMap;
}

export function createA2ARouter(agents: Map<string, IAgentRuntime>): Router {
    const router = Router();
    globalAgentsMap = agents; // Store agents map for the handler (Needs better solution)

    // --- /.well-known/agent.json ---
    router.get('/.well-known/agent.json', async (req, res) => {
        try {
            res.setHeader('Content-Type', 'application/json');
            if (process.env.NODE_ENV === 'development') {
                res.send({...agentJson, url: 'http://localhost:3000/a2a'});
            } else {
                res.send(agentJson);
            }
        } catch (error) {
            console.error("Error serving agent.json:", error);
            res.status(500).json({ jsonrpc: "2.0", error: { code: ErrorCodeInternalError, message: 'Could not load agent configuration.' } });
        }
    });

    // --- A2A JSON-RPC Endpoint ---
    router.post(A2A_BASE_PATH, async (req: Request, res: Response) => {
        const { method, params, id: reqId } = req.body;

        console.log(`[A2A] Received method: ${method} (ID: ${reqId})`);

        if (!method) {
            return res.status(400).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeInvalidRequest, message: 'Missing required field: method' } });
        }

        // --- Dispatch based on method ---
        switch (method) {
            case 'tasks/send':
                await handleTasksSend(req, res, params, reqId);
                break;
            case 'tasks/get':
                handleTasksGet(req, res, params, reqId);
                break;
            case 'tasks/sendSubscribe':
                handleTasksSendSubscribe(req, res, params, reqId); // No await, handles response itself
                break;
            case 'tasks/cancel':
                handleTasksCancel(req, res, params, reqId);
                break;
            // TODO: Add cases for other methods
            default:
                res.status(400).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeMethodNotFound, message: `Unsupported method: ${method}` } });
        }
    });

    return router;
}

// --- Handler Functions ---

// Execute task handler in background, updating store
async function runTaskHandlerInBackground(taskId: string, context: TaskContext) {
    try {
        const handler = elizaTaskHandler(context);
        for await (const update of handler) {
            const task = taskStore.get(taskId);
            if (!task) break; // Task was deleted or is no longer tracked

            if (context.isCancelled() && task.status.state !== 'canceled' && task.status.state !== 'completed' && task.status.state !== 'failed') {
                 task.status = { state: 'canceled', timestamp: new Date().toISOString() };
                 taskStore.set(taskId, { ...task });
                 break; // Stop processing if canceled externally
            }

            if (update.type === 'error') {
                task.status = {
                    state: 'failed',
                    timestamp: new Date().toISOString(),
                    message: { role: 'agent', parts: [{ type: 'text', text: `Error: ${update.error.message}` }] }
                };
                task.artifacts = undefined; // Clear artifacts on failure
                taskStore.set(taskId, { ...task });
                break; // Stop on error
            } else if (update.type === 'artifact') {
                const { type, ...artifactData } = update;
                 if (!task.artifacts) task.artifacts = [];
                 task.artifacts.push({ ...artifactData, index: task.artifacts.length }); // Add artifact with index
                 taskStore.set(taskId, { ...task });
            } else {
                // It's a TaskStatus update (state, message)
                 task.status = { ...update, timestamp: new Date().toISOString() };
                 taskStore.set(taskId, { ...task });
                 if (task.status.state === 'completed' || task.status.state === 'failed' || task.status.state === 'canceled') {
                     break; // Stop generator processing if task reaches a terminal state
                 }
            }
        }
    } catch (e) {
        // Catch errors in the generator runner itself
        console.error(`[Task Runner ${taskId}] Error running handler:`, e);
        const task = taskStore.get(taskId);
        if (task && task.status.state !== 'failed' && task.status.state !== 'completed' && task.status.state !== 'canceled') {
            task.status = { state: 'failed', timestamp: new Date().toISOString(), message: { role: 'agent', parts: [{ type: 'text', text: `Internal handler runner error: ${e.message}` }] } };
            taskStore.set(taskId, { ...task });
        }
    } finally {
         // Ensure cleanup even if runner loop fails
        taskCancellationEmitters.delete(taskId);
    }
}


// --- tasks/send ---
async function handleTasksSend(req: Request, res: Response, params: any, reqId: string | number | null) {
    const { id: clientTaskId, message: incomingMessage, skillId } = params as { id?: string, message: Message, skillId?: string };

    // Basic Validation
    if (!incomingMessage || !Array.isArray(incomingMessage.parts) || incomingMessage.parts.length === 0) {
        return res.status(400).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeInvalidParams, message: 'Invalid request: Missing or invalid message parts.' } });
    }

    // Task Creation
    const taskId = clientTaskId || uuidv4();
    const nowISO = new Date().toISOString();
    let task: Task = {
        id: taskId,
        status: { state: 'submitted', timestamp: nowISO },
        metadata: skillId ? { skillId: skillId } : undefined,
    };
    taskStore.set(taskId, { ...task });

    // Cancellation Setup
    const cancellationEmitter = new EventEmitter();
    taskCancellationEmitters.set(taskId, cancellationEmitter);
    let cancelled = false;
    const isCancelled = () => cancelled;
    cancellationEmitter.once('cancel', () => { cancelled = true; });

    // Prepare Context
    const context: TaskContext = {
        task: { ...task }, // Pass a copy
        incomingMessage,
        cancellationEmitter,
        isCancelled,
        userId: req['jwtUserId'] || 'a2a-user' // Pass user ID from request context
    };

    // Start handler in background (DO NOT AWAIT)
    runTaskHandlerInBackground(taskId, context).catch(e => console.error(`[Task Runner ${taskId}] Unhandled background error: ${e}`));

    // Update status to working immediately and respond
    task.status = { state: 'working', timestamp: new Date().toISOString() };
    taskStore.set(taskId, { ...task }); // Update store

    console.log(`[A2A tasks/send] Responding with 'working' status for task ${taskId}`);
    res.status(200).json({ jsonrpc: "2.0", id: reqId, result: task });
}

// --- tasks/sendSubscribe ---
function handleTasksSendSubscribe(req: Request, res: Response, params: any, reqId: string | number | null) {
    const { id: clientTaskId, message: incomingMessage, skillId } = params as { id?: string, message: Message, skillId?: string };

    // Basic Validation
    if (!incomingMessage || !Array.isArray(incomingMessage.parts) || incomingMessage.parts.length === 0) {
        // Cannot send 400 easily with SSE, maybe close connection? Or send initial error event?
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeInvalidParams, message: 'Invalid request: Missing or invalid message parts.' } }));
        return;
    }

    // --- Task Creation ---
    const taskId = clientTaskId || uuidv4();
    const nowISO = new Date().toISOString();
    let task: Task = {
        id: taskId,
        status: { state: 'submitted', timestamp: nowISO },
        metadata: skillId ? { skillId: skillId } : undefined,
    };
    taskStore.set(taskId, { ...task });

    // --- Cancellation Setup ---
    const cancellationEmitter = new EventEmitter();
    taskCancellationEmitters.set(taskId, cancellationEmitter);
    let cancelled = false;
    const isCancelled = () => cancelled;
    cancellationEmitter.once('cancel', () => { cancelled = true; });

    // --- SSE Setup ---
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    // --- Prepare Context ---
    const context: TaskContext = {
        task: { ...task }, incomingMessage, cancellationEmitter, isCancelled,
        userId: req['jwtUserId'] || 'a2a-user' // Pass user ID from request context
    };

    // --- Run Handler and Stream Updates ---
    (async () => {
        try {
            const handler = elizaTaskHandler(context);
            let finalEventSent = false; // Track if final event was sent

            for await (const update of handler) {
                //  if (res.writableEnded) break; // Stop if client disconnected
                 const currentTask = taskStore.get(taskId); // Get latest task state
                 if (!currentTask) break;

                 let eventPayload: TaskStatusUpdateEvent | TaskArtifactUpdateEvent | null = null;
                 let eventType = 'task_status_update'; // Default event type
                 let isFinal = false;

                 if (update.type === 'error') {
                     currentTask.status = { state: 'failed', timestamp: new Date().toISOString(), message: { role: 'agent', parts: [{ type: 'text', text: `Error: ${update.error.message}` }] } };
                     eventPayload = { id: taskId, status: currentTask.status, final: true };
                     isFinal = true;
                 } else if (update.type === 'artifact') {
                    const { type, ...artifactData } = update;
                     if (!currentTask.artifacts) currentTask.artifacts = [];
                     const newArtifact = { ...artifactData, index: currentTask.artifacts.length };
                     currentTask.artifacts.push(newArtifact);
                     // Decide if artifact update is final (can be tricky, maybe based on state?)
                     const artifactIsFinal = (currentTask.status.state === 'completed' || currentTask.status.state === 'failed');
                     eventPayload = { id: taskId, artifact: newArtifact, final: artifactIsFinal };
                     eventType = 'task_artifact_update';
                     // isFinal = artifactIsFinal; // Don't mark the *stream* final on artifact alone usually
                 } else {
                     // Status update
                     currentTask.status = { ...update, timestamp: new Date().toISOString() };
                     isFinal = ['completed', 'failed', 'canceled'].includes(currentTask.status.state);
                     eventPayload = { id: taskId, status: currentTask.status, final: isFinal };
                 }

                 taskStore.set(taskId, { ...currentTask }); // Update store

                 if (eventPayload) { // } && !res.writableEnded) {
                     // Format as JSON-RPC Notification for the event data
                     const notification = { jsonrpc: "2.0", method: eventType, result: eventPayload };
                     res.write(`data: ${JSON.stringify(notification)}\n\n`);
                 }

                 if (isFinal) {
                     finalEventSent = true;
                     break; // Stop after final state
                 }
            }

            // Ensure a final event is sent if the generator finishes without yielding a terminal state explicitly
            if (!finalEventSent) { // } && !res.writableEnded) {
                 const finalTask = taskStore.get(taskId);
                 if (finalTask && !['completed', 'failed', 'canceled'].includes(finalTask.status.state)) {
                     // If loop finished but task isn't terminal, mark it completed? Or maybe failed? Depends on desired behavior.
                     console.warn(`[A2A tasks/sendSubscribe] Task handler for ${taskId} finished without explicit terminal state. Marking completed.`);
                     finalTask.status.state = 'completed';
                     finalTask.status.timestamp = new Date().toISOString();
                     taskStore.set(taskId, finalTask);
                     const finalPayload: TaskStatusUpdateEvent = { id: taskId, status: finalTask.status, final: true };
                     const notification = { jsonrpc: "2.0", method: 'task_status_update', result: finalPayload };
                     res.write(`data: ${JSON.stringify(notification)}\n\n`);
                 }
             }

        } catch (e) {
            console.error(`[A2A tasks/sendSubscribe] Error streaming task ${taskId}:`, e);
            try {
                const errorPayload: TaskStatusUpdateEvent = {
                    id: taskId,
                    status: { state: 'failed', timestamp: new Date().toISOString(), message: { role: 'agent', parts: [{ type: 'text', text: `Streaming Error: ${e.message}` }] } },
                    final: true
                };
                const notification = { jsonrpc: "2.0", method: 'task_status_update', result: errorPayload };
                res.write(`data: ${JSON.stringify(notification)}\n\n`);
            } catch (writeError) {
                console.error(`[A2A tasks/sendSubscribe] Failed to write final error event for task ${taskId}:`, writeError);
            }
            // }
        } finally {
            // if (!res.writableEnded) {
            //     console.log(`[A2A tasks/sendSubscribe] ENDING with res.end()`);
            //     res.end(); // Close the SSE connection
            // }
            taskCancellationEmitters.delete(taskId); // Clean up emitter
            console.log(`[A2A tasks/sendSubscribe] Stream ended for task ${taskId}.`);
        }
    })(); // Immediately invoke the async function
}


// --- tasks/get ---
function handleTasksGet(req: Request, res: Response, params: any, reqId: string | number | null) {
    const { id } = params as { id?: string };

    if (!id) {
         return res.status(400).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeInvalidParams, message: 'Missing required field: id' } });
    }
    console.log(`[A2A tasks/get] Request for task ${id}`);
    const task = taskStore.get(id);

    if (!task) {
      return res.status(404).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeTaskNotFound , message: 'Task not found' } });
    }
    // Return task state according to schema
    res.status(200).json({ jsonrpc: "2.0", id: reqId, result: task });
}

// --- tasks/cancel ---
function handleTasksCancel(req: Request, res: Response, params: any, reqId: string | number | null) {
    const { id } = params as { id?: string };

    if (!id) {
        return res.status(400).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeInvalidParams, message: 'Missing required field: id' } });
    }
    console.log(`[A2A tasks/cancel] Request for task ${id}`);
    const task = taskStore.get(id);
    const emitter = taskCancellationEmitters.get(id);

    if (!task) {
        return res.status(404).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeTaskNotFound, message: 'Task not found' } });
    }

    // Check if task is cancelable (e.g., in submitted or working state)
    if (['completed', 'failed', 'canceled'].includes(task.status.state)) {
         return res.status(400).json({ jsonrpc: "2.0", id: reqId, error: { code: ErrorCodeTaskNotCancelable, message: `Task is already in terminal state: ${task.status.state}` } });
    }

    // Signal cancellation via emitter
    if (emitter) {
        emitter.emit('cancel');
        console.log(`[A2A tasks/cancel] Cancellation signal sent for task ${id}`);
    } else {
        // Should not happen if task exists and is running, but handle defensively
        console.warn(`[A2A tasks/cancel] No active cancellation emitter found for running task ${id}. Forcing status update.`);
    }

    // Update task state immediately to 'canceled' (or let the handler do it via yield?)
    // Let's update it here for immediate feedback, the handler will also detect and yield/stop.
    task.status = { state: 'canceled', timestamp: new Date().toISOString(), message: { role: 'agent', parts: [{type: 'text', text: 'Cancellation requested.'}] } };
    taskStore.set(id, { ...task });
    taskCancellationEmitters.delete(id); // Remove emitter once cancelled

    // Return the updated task object
    res.status(200).json({ jsonrpc: "2.0", id: reqId, result: task });
}
