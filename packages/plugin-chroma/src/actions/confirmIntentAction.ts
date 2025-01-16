import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
import { SwapIntent } from '../lib/types';
import { MessageProviderFactory } from '../lib/messaging/providerFactory';

export const confirmIntentAction: Action = {
  name: 'CONFIRM_INTENT',
  similes: ['INTENT_CONFIRMATION', 'CONFIRM_SWAP'],
  description: 'Checks if user wants to confirm the intent and proceed with broadcasting',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return /\b(confirm|yes|ok|go|proceed)\b/i.test(text);
  },

  handler: async (runtime: IAgentRuntime, message: Memory, _state: State, _options, callback: HandlerCallback): Promise<boolean> => {
    console.log('confirmIntentAction.ts:15');
    // 1. Get the stored (pending) intent
    const intentManager = new MemoryManager({ runtime, tableName: 'intents' });
    const [intentMemory] = await intentManager.getMemories({
      roomId: message.roomId,
      count: 1,
      unique: true
    });

    console.log('confirmIntentAction.ts:24');
    if (!intentMemory?.content?.intent) {
      callback({ text: 'Sorry, I could not find a pending intent to confirm. Please create a new swap request.' });
      return false;
    }
    console.log('confirmIntentAction.ts:29');

    const intent: SwapIntent = typeof intentMemory.content.intent === 'object'
      ? intentMemory.content.intent
      : {};

    if (intent.status !== 'pending') {
      callback({ text: 'The last intent is not pending. Please create a new swap request.' });
      return false;
    }

    console.log('confirmIntentAction.ts:40');
    // 2. Remove the old memory
    await intentManager.removeMemory(intentMemory.id);

    // 3. Mark it as confirmed
    const confirmedIntent: SwapIntent = {
      ...intent,
      status: 'confirmed'
    };

    console.log('confirmIntentAction.ts:50');
    // 4. Prepare the new content
    const newContent = {
      ...intentMemory.content,
      action: 'CONFIRM_INTENT',
      intent: confirmedIntent
    };

    // Check if we have already published to the general topic once
    const wasFirstPublished = Boolean(intentMemory.content?.publishedFirstWaku);

    console.log('confirmIntentAction.ts:61');
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

    console.log('confirmIntentAction.ts:75');
    // 6. Get the message provider
    const provider = await MessageProviderFactory.getProvider();
    const configuredExpiration =
      parseInt(runtime.getSetting('MESSAGE_SUBSCRIPTION_EXPIRATION') || '') ||
      600;

    console.log('confirmIntentAction.ts:82');
    // -- If we haven't posted to the general topic yet, do that first
    if (!wasFirstPublished) {
      console.log('Publishing to the general topic');
      // Publish the *first* message to the "general" topic
      await provider.publishToGeneral({
        timestamp: Date.now(),
        roomId: message.roomId,
        body: confirmedIntent
      });

      // Mark memory as "first published = true"
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

    console.log('confirmIntentAction.ts:107');
    // 7. Subscribe to the room's topic for subsequent messages
    await provider.subscribeToRoom(
      message.roomId,
      async (receivedMessage) => {
        console.log('Received a message in room', message.roomId, receivedMessage.body);

        // Create a response memory
        const responseMemory: Memory = {
          id: stringToUuid(`${Date.now()}-${runtime.agentId}`),
          userId: runtime.agentId,
          agentId: runtime.agentId,
          roomId: message.roomId,
          content: {
            text: `Proposal:\n\`\`\`json\n${JSON.stringify(receivedMessage.body, null, 2)}\n\`\`\``,
            source: 'chroma'
          },
          createdAt: Date.now(),
          embedding: getEmbeddingZeroVector()
        };

        // Store the response in the message manager
        await runtime.messageManager.createMemory(responseMemory);

        // Use callback to ensure the message appears in chat
        await callback({
          text: responseMemory.content.text
        });

        // Update state and process any actions if needed
        const state = await runtime.updateRecentMessageState(
          await runtime.composeState(responseMemory)
        );

        await runtime.evaluate(responseMemory, state, false, callback);
      },
      configuredExpiration
    );

    console.log('confirmIntentAction.ts:146');
    // 8. For the user's current "confirm" request, we might also want to broadcast to the room
    if (wasFirstPublished) {
      console.log('confirmIntentAction.ts:149');
      // Only do this if the general publish was previously done
      await provider.publishToRoom({
        timestamp: Date.now(),
        roomId: message.roomId,
        body: confirmedIntent
      });
    }

    // 9. Let the user know
    callback({ text: 'Broadcasting your swap intent...' });

    // Do not respond to the user's message
    return false;
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
