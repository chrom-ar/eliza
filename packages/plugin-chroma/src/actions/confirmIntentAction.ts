import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
import { SwapIntent } from '../lib/types';
import { MessageProviderFactory } from '../lib/messaging/providerFactory';
import WakuClientInterface from '@elizaos/client-waku';

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
      callback({ text: 'Sorry, I could not find a pending intent to confirm. Please create a new request.' });
      return false;
    }

    // TODO: MultiIntent compat
    const intent: SwapIntent = typeof intentMemory.content.intent === 'object'
      ? intentMemory.content.intent
      : {};

    if (intent.status !== 'pending') {
      callback({ text: 'The last intent is not pending. Please create a new request.' });
      return false;
    }

    // 2. Remove the old memory
    await intentManager.removeMemory(intentMemory.id);

    // TODO: MultiIntent compat
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

    // 5. Create new memory that indicates we have published (or not)
    await intentManager.createMemory({
      userId:    message.userId,
      agentId:   message.agentId,
      roomId:    message.roomId,
      createdAt: Date.now(),
      unique:    true,
      content:   newContent,
    });

    // 6. Get the message provider
    const waku = await WakuClientInterface.start(runtime);
    // const configuredExpiration =
    //   parseInt(runtime.getSetting('MESSAGE_SUBSCRIPTION_EXPIRATION') || '') ||
    //   600;

    // 7. Subscribe to the room's topic for subsequent messages
    // await waku.subscribe(
    //   message.roomId,
    //   (async (receivedMessage) => {
    //     try {
    //       // Create a response memory
    //       const responseMemory: Memory = {
    //         id:      stringToUuid(`${Date.now()}-${runtime.agentId}`),
    //         userId:  message.userId,
    //         agentId: message.agentId,
    //         roomId:  message.roomId,
    //         content: {
    //           text: JSON.stringify(receivedMessage.body, null, 2),
    //           contentType: 'application/json'
    //           // source: 'chroma'
    //         },
    //         createdAt: Date.now(),
    //         embedding: getEmbeddingZeroVector()
    //       };

    //       console.log("Creating msg memory:", responseMemory)

    //       // Store the response in the message manager
    //       await runtime.messageManager.createMemory(responseMemory);

    //       // Use callback to ensure the message appears in chat
    //       await callback(responseMemory.content);

    //       // Update state and process any actions if needed
    //       const state = await runtime.updateRecentMessageState(
    //         await runtime.composeState(responseMemory)
    //       );

    //       await runtime.evaluate(responseMemory, state, false);
    //     } catch (e) {
    //       console.error("Error inside subscription:", e)
    //     }
    //   })
    //   // configuredExpiration
    // )

    console.log('Publishing to the general topic');
    // Publish the *first* message to the "general" topic
    await waku.sendMessage(
      confirmedIntent,
      '', // General intent topic
      message.roomId
    );

    // TMP: This shit should be like this, workaround to make the chat refresh work
    await new Promise<void>((resolve) => {
      waku.subscribe(
        message.roomId,
        async (receivedMessage) => {
          try {
            // console.log("Received msj in subscription:", receivedMessage)
            console.log('Received a message in room', message.roomId, receivedMessage.body);

            // Create a response memory
            const responseMemory: Memory = {
              id: stringToUuid(`${Date.now()}-${runtime.agentId}`),
              userId: message.userId,
              agentId: message.agentId,
              roomId: message.roomId,
              content: {
                text: JSON.stringify(receivedMessage.body, null, 2),
                contentType: 'application/json'
              },
              createdAt: Date.now(),
              embedding: getEmbeddingZeroVector()
            };

            console.log("Creating msg memory:", responseMemory)

            // Store the response in the message manager
            await runtime.messageManager.createMemory(responseMemory);

            // Use callback to ensure the message appears in chat
            await callback(responseMemory.content)

            // Update state and process any actions if needed
            const state = await runtime.updateRecentMessageState(
              await runtime.composeState(responseMemory)
            );

            await runtime.evaluate(responseMemory, state, false, callback);
          } catch (e) {
            console.error("Error inside subscription:", e)
          }

          resolve()
        }
      )
    })

    // Do not respond to the user's message
    return false;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes, confirm' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Broadcasting your intent...',
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
          text: 'Broadcasting your intent...',
          action: 'CONFIRM_INTENT'
        }
      }
    ]
  ]
};
