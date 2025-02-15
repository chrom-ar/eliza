import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
// import { SwapIntent } from '../lib/types';
import { WakuClient } from '../lib/waku-client';

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
    console.log("IntentManager: ", intentManager)
    console.log("IntentMemory: ", intentMemory)

    if (!intentMemory?.content?.intent) {
      callback({ text: 'Sorry, I could not find a pending intent to confirm. Please create a new request.' });
      return false;
    }

    const intent = intentMemory.content?.intent

    if (typeof intent !== 'object') {
      callback({ text: 'The last intent is not pending. Please create a new request.' });
      return false;
    }

    // console.log("Antes que explote: ", intentManager, intentManager.removeAllMemories)

    // 2. Remove the old memory
    await intentManager.removeAllMemories(message.roomId);

    // 6. Get the message provider
    const waku = await WakuClient.new(runtime);
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
      intent,
      '', // General intent topic
      message.roomId
    );

    // TMP: This shit should be like this, workaround to make the chat refresh work
    await new Promise<void>((resolve) => {
      waku.subscribe(
        message.roomId,
        async (receivedMessage) => {
          try {
            let memoryText = `Best proposal: ${receivedMessage.body.proposal.description}.\nActions:\n`
            const calls = receivedMessage.body.proposal.calls
            for (let index in calls) {
              memoryText += `- ${parseInt(index) + 1}: ${calls[index]}\n` // JS always surprising you
            }
            memoryText += `\nDo you want to confirm?`

            // Create a response memory
            const responseMemory: Memory = await runtime.messageManager.addEmbeddingToMemory({
              userId: message.userId,
              agentId: message.agentId,
              roomId: message.roomId,
              content: {
                text: memoryText,
                action: message.content.action,
                source: receivedMessage.body.source,
                proposal: receivedMessage.body.proposal
              },
              createdAt: Date.now()
            });

            await runtime.messageManager.createMemory(responseMemory);

            // Use callback to ensure the message appears in chat
            await callback(responseMemory.content)

            // Update state and process any actions if needed
            const state = await runtime.updateRecentMessageState(
              await runtime.composeState(responseMemory)
            );

            await runtime.evaluate(responseMemory, state, false, callback);

            // Persist the proposal
            const proposalManager = new MemoryManager({
              runtime,
              tableName: 'proposals'
            });

            const newMemory: Memory = await proposalManager.addEmbeddingToMemory({
              userId: message.userId,
              agentId: message.agentId,
              roomId: message.roomId,
              createdAt: Date.now(),
              unique: true,
              content: {
                text: memoryText,
                action: message.content.action,
                source: message.content?.source,
                proposal: receivedMessage.body.proposal
              }
            });

            await proposalManager.createMemory(newMemory);

            // callback(newMemory.content);

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
          text: 'Sending your intent...',
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
          text: 'Sending your intent...',
          action: 'CONFIRM_INTENT'
        }
      }
    ]
  ]
};
