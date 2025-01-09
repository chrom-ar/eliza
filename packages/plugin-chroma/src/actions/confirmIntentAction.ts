import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback } from '@elizaos/core';
import { SwapIntent } from '../lib/types';
import { WakuSubscriptionManager } from '../lib/waku/manager';

export const confirmIntentAction: Action = {
  name: 'CONFIRM_INTENT',
  similes: ['INTENT_CONFIRMATION', 'CONFIRM_SWAP'],
  description: 'Checks if user wants to confirm the intent and proceed with broadcasting',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return /\b(confirm|yes|ok|go|proceed)\b/i.test(text);
  },

  handler: async (runtime: IAgentRuntime, message: Memory, _state: State, _options, callback: HandlerCallback): Promise<boolean> => {
    // 1. Get the stored (pending) intent
    const intentManager = new MemoryManager({ runtime, tableName: 'intents' });
    const [intentMemory] = await intentManager.getMemories({
      roomId: message.roomId,
      count: 1,
      unique: true
    });

    if (!intentMemory?.content?.intent) {
      callback({ text: 'Sorry, I could not find a pending intent to confirm. Please create a new swap request.' });
      return false;
    }

    const intent: SwapIntent = typeof intentMemory.content.intent === 'object'
      ? intentMemory.content.intent
      : {};

    if (intent.status !== 'pending') {
      callback({ text: 'The last intent is not pending. Please create a new swap request.' });
      return false;
    }

    // 2. Remove the old memory
    await intentManager.removeMemory(intentMemory.id);

    // 3. Mark it as confirmed
    const confirmedIntent: SwapIntent = {
      ...intent,
      status: 'confirmed'
    };

    // 4. Prepare the new content
    const newContent = {
      ...intentMemory.content,
      action: 'CONFIRM_INTENT',
      intent: confirmedIntent
    };

    // Check if we have already published to the general topic once
    // It is an aweful way to do this, but it's a quick way to get the job done and test it
    const wasFirstPublished = Boolean(intentMemory.content?.publishedFirstWaku);

    // 5. Create new memory that indicates we have published (or not)
    await intentManager.createMemory({
      userId: message.userId,
      agentId: message.agentId,
      roomId: message.roomId,
      createdAt: Date.now(),
      unique: true,
      content: {
        ...newContent,
        publishedFirstWaku: !!wasFirstPublished
      }
    });

    // 6. Waku manager
    const subscriptionMgr = WakuSubscriptionManager.getInstance();
    const defaultExpiration = 600;
    const configuredExpiration =
      parseInt(runtime.getSetting('WAKU_ROOM_SUBSCRIPTION_EXPIRATION') || '') ||
      defaultExpiration;

    // -- If we haven't posted to the general topic yet, do that first
    if (!wasFirstPublished) {
      console.log('Publishing to the general topic');
      // Publish the *first* message to the "general" topic
      await subscriptionMgr.publishGeneralIntent(confirmedIntent, message.roomId);

      // Mark memory as "first published = true"
      // so next time we skip the general topic
      // We can do it either by updating the newly created memory above or by re-creating it.
      await intentManager.createMemory({
        userId: message.userId,
        agentId: message.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        unique: true,
        content: {
          ...newContent,
          publishedFirstWaku: true
        }
      });
    }

    // 7. Subscribe to the room’s topic for subsequent messages
    await subscriptionMgr.subscribeRoom(
      message.roomId,
      async (receivedBody) => {
        console.log('Received a Waku message in room', message.roomId, receivedBody);
        // Could store this solver response in memory if desired
      },
      configuredExpiration
    );

    // 8. For the user’s current “confirm” request, we might also want to broadcast to the room
    //    so that any watchers in this room topic see the "confirmed" status. This is optional
    //    but many flows do it to keep the conversation in one place.
    if (wasFirstPublished) {
      // Only do this if the general publish was previously done
      await subscriptionMgr.publishToRoom(message.roomId, confirmedIntent);
    }

    // 9. Let the user know
    callback({ text: 'Broadcasting your swap intent...' });
    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes, confirm the swap' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Broadcasting your swap intent...',
          action: 'CONFIRM_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Broadcasting your swap intent...',
          action: 'CONFIRM_INTENT'
        }
      }
    ]
  ]
};
