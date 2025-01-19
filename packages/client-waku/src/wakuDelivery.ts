import { WakuBase } from './base';
import { IAgentRuntime, elizaLogger, Memory, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
import { WakuConfig } from './environment';

/**
 * This is a simple plugin class that uses WakuBase to provide
 * send and receive functionality. Adjust as needed.
 */
export class WakuDelivery {
  private wakuBase: WakuBase;
  private wakuConfig: WakuConfig;
  private isInitialized = false;

  constructor(private runtime: IAgentRuntime, private config: WakuConfig) {
    this.wakuBase = new WakuBase(config);
    this.wakuConfig = config;
  }

  async init() {
    await this.wakuBase.init();
    /**
     * Hooking the 'message' event.
     * We'll ignore (but log) messages that don't have a roomId
     * Otherwise, we store inbound messages in the memory manager.
     */
    // this.wakuBase.on('message', async (event) => {
    //   console.log('[ClientWaku] Received message =>', event);

    //   // If no roomId, ignore but log
    //   if (!event.roomId || !event.roomId.trim()) {
    //     elizaLogger.warn(`[ClientWaku] Received message without roomId, ignoring: ${JSON.stringify(event)}`);
    //     return;
    //   }

    //   // Otherwise handle the message
    //   const roomIdStr = event.roomId;
    //   elizaLogger.debug(`[ClientWaku] Received message for roomId=${roomIdStr}`);

    //   // Example: Hardcoded user identity for demonstration
    //   const userId = stringToUuid('user-waku-123');

    //   // We'll unify a "room" as (event.roomId + agentId)
    //   const roomUUID = stringToUuid(roomIdStr + '-' + this.runtime.agentId);

    //   try {
    //     // Ensure the user & room exist in the agent’s system
    //     await this.runtime.ensureUserExists(
    //       userId,
    //       'WakuUser', // handle
    //       'WakuUser', // display name
    //       'waku'
    //     );

    //     await this.runtime.ensureConnection(
    //       userId,
    //       roomUUID,
    //       'WakuUser',
    //       'WakuUser',
    //       'waku'
    //     );

    //     // Create a unique memory ID, e.g. using the timestamp
    //     const memoryId = stringToUuid(`waku-inbound-${roomIdStr}-${event.timestamp}`);

    //     // Build the Memory object
    //     const memory: Memory = {
    //       id: memoryId,
    //       agentId: this.runtime.agentId,
    //       roomId: roomUUID,
    //       userId,
    //       content: {
    //         text: JSON.stringify(event.body),
    //         source: 'waku'
    //       },
    //       createdAt: event.timestamp,
    //       embedding: getEmbeddingZeroVector()
    //     };

    //     // Store in DB
    //     await this.runtime.messageManager.createMemory(memory);
    //     elizaLogger.debug(`[ClientWaku] Stored inbound Waku msg in memory: ${memoryId}`);
    //   } catch (error) {
    //     elizaLogger.error('[ClientWaku] Error storing inbound Waku msg:', error);
    //   }
    // });

    this.isInitialized = true;
  }

  async subscribe(topic: string, fn: any) {
    if (!this.isInitialized) {
      console.warn('[ClientWaku] Not initialized. Call init() first.');
      return;
    }

    await this.wakuBase.subscribe(topic, fn);
  }

  /**
   * Sends a message to the default content topic.
   * Also stored in memory, just like inbound messages.
   */
  async send(message: object, topic: string, roomId: string) {
    if (!this.isInitialized) {
      console.warn('[ClientWaku] Not initialized. Call init() first.');
      return;
    }

    // If no roomId provided, use a default (but you might want to require it)
    // const roomIdStr = roomId || 'waku-default-room';

    // 1. Actually send via Waku
    await this.wakuBase.sendMessage(message, topic, roomId);

    // 2. Store the outbound message in memory
    // try {
    //   const agentUserId = this.runtime.agentId;
    //   const roomUUID = stringToUuid(roomIdStr + '-' + agentUserId);

    //   // Ensure the agent is recognized in that room
    //   await this.runtime.ensureConnection(
    //     agentUserId,
    //     roomUUID,
    //     'WakuAgent',
    //     'WakuAgent',
    //     'waku'
    //   );

    //   // Create a memory ID for the outbound message
    //   const outMemoryId = stringToUuid(`waku-outbound-${roomIdStr}-${Date.now()}`);
    //   const memory: Memory = {
    //     id: outMemoryId,
    //     agentId: this.runtime.agentId,
    //     roomId: roomUUID,
    //     userId: agentUserId, // agent is the "user" in this context
    //     content: {
    //       text: JSON.stringify(message),
    //       source: 'waku'
    //     },
    //     createdAt: Date.now(),
    //     embedding: getEmbeddingZeroVector()
    //   };

    //   await this.runtime.messageManager.createMemory(memory);
    //   elizaLogger.debug(`[ClientWaku] Stored outbound Waku msg in memory: ${outMemoryId}`);
    // } catch (error) {
      // elizaLogger.error('[ClientWaku] Error storing outbound Waku msg:', error);
    // }
  }

  async stop() {
    await this.wakuBase.stop();
    this.isInitialized = false;
  }

  buildFullTopic(topic?: string): string {
    return this.wakuBase.buildFullTopic(topic);
  }
}
