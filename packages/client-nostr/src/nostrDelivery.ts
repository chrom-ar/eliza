import { NostrBase } from './base';
import { IAgentRuntime, elizaLogger, Memory, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
import { NostrConfig } from './environment';

/**
 * This is a simple plugin class that uses NostrBase to provide
 * send and receive functionality. Adjust as needed.
 */
export class NostrDelivery {
  private nostrBase: NostrBase;
  private nostrConfig: NostrConfig;
  private isInitialized = false;

  constructor(private runtime: IAgentRuntime, private config: NostrConfig) {
    this.nostrBase = new NostrBase(config);
    this.nostrConfig = config;
  }

  async init(topic?: string) {
    await this.nostrBase.init();
    // await this.nostrBase.subscribe(); // this should be "on demand"

    /**
     * Hooking the 'message' event.
     * We'll ignore (but log) messages that don't have a roomId
     * Otherwise, we store inbound messages in the memory manager.
     */
    this.nostrBase.on('message', async (event) => {
      console.log('[NostrPlugin] Received message =>', event);

      const content = JSON.parse(event.content)
      const roomIdStr = content.roomId?.trim();

      // If no roomId, ignore but log
      if (!roomIdStr) {
        elizaLogger.warn(`[NostrPlugin] Received message without roomId, ignoring: ${event.content}`);
        return;
      }

      // Otherwise handle the message
      elizaLogger.debug(`[NostrPlugin] Received message for roomId=${roomIdStr}`);

      // Example: Hardcoded user identity for demonstration
      const userId = stringToUuid('user-nostr-123');

      // We'll unify a "room" as (content.roomId + agentId)
      const roomUUID = stringToUuid(roomIdStr + '-' + this.runtime.agentId);

      try {
        // Ensure the user & room exist in the agent’s system
        await this.runtime.ensureUserExists(
          userId,
          'NostrUser', // handle
          'NostrUser', // display name
          'nostr'
        );

        await this.runtime.ensureConnection(
          userId,
          roomUUID,
          'NostrUser',
          'NostrUser',
          'nostr'
        );

        // Create a unique memory ID, e.g. using the timestamp
        const memoryId = stringToUuid(`nostr-inbound-${roomIdStr}-${event.timestamp}`);

        // Build the Memory object
        const memory: Memory = {
          id: memoryId,
          agentId: this.runtime.agentId,
          roomId: roomUUID,
          userId,
          content: {
            text: content.body,
            source: 'nostr'
          },
          createdAt: event.timestamp,
          embedding: getEmbeddingZeroVector()
        };

        // Store in DB
        await this.runtime.messageManager.createMemory(memory);
        elizaLogger.debug(`[NostrPlugin] Stored inbound Nostr msg in memory: ${memoryId}`);
      } catch (error) {
        elizaLogger.error('[NostrPlugin] Error storing inbound Nostr msg:', error);
      }
    });

    this.isInitialized = true;
  }

  /**
   * Sends a message to the default content topic.
   * Also stored in memory, just like inbound messages.
   */
  async send(message: string, secretKey: Uint8Array, roomId?: string) {
    if (!this.isInitialized) {
      console.warn('[NostrPlugin] Not initialized. Call init() first.');
      return;
    }

    // If no roomId provided, use a default (but you might want to require it)
    const roomIdStr = roomId || 'nostr-default-room';

    // 1. Actually send via Nostr
    await this.nostrBase.sendMessage(message, this.nostrConfig.NOSTR_CONTENT_TOPIC, roomIdStr, secretKey);

    // 2. Store the outbound message in memory
    try {
      const agentUserId = this.runtime.agentId;
      const roomUUID = stringToUuid(roomIdStr + '-' + agentUserId);

      // Ensure the agent is recognized in that room
      await this.runtime.ensureConnection(
        agentUserId,
        roomUUID,
        'NostrAgent',
        'NostrAgent',
        'nostr'
      );

      // Create a memory ID for the outbound message
      const outMemoryId = stringToUuid(`nostr-outbound-${roomIdStr}-${Date.now()}`);
      const memory: Memory = {
        id: outMemoryId,
        agentId: this.runtime.agentId,
        roomId: roomUUID,
        userId: agentUserId, // agent is the "user" in this context
        content: {
          text: message,
          source: 'nostr'
        },
        createdAt: Date.now(),
        embedding: getEmbeddingZeroVector()
      };

      await this.runtime.messageManager.createMemory(memory);
      elizaLogger.debug(`[NostrPlugin] Stored outbound Nostr msg in memory: ${outMemoryId}`);
    } catch (error) {
      elizaLogger.error('[NostrPlugin] Error storing outbound Nostr msg:', error);
    }
  }

  async stop() {
    await this.nostrBase.stop();
    this.isInitialized = false;
  }
}
