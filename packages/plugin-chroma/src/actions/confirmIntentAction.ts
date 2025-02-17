import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
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

    if (!intentMemory?.content?.intent) {
      callback({ text: 'Sorry, I could not find a pending intent to confirm. Please create a new request.' });
      return false;
    }

    const intent = intentMemory.content?.intent

    if (typeof intent !== 'object') {
      callback({ text: 'The last intent is not pending. Please create a new request.' });
      return false;
    }

    // 2. Remove the old memory
    await intentManager.removeAllMemories(message.roomId);

    const waku = await WakuClient.new(runtime);

    let counter = 0
    let proposals = []
    let finalText = ''
    const expiration = Date.now() + 6000;

    // Subscribe to the room to receive the proposals
    await waku.subscribe(
      message.roomId,
      async (receivedMessage) => {
        if (Date.now() > expiration) {
          console.log('msg expired', receivedMessage.body);
          // TODO unsubscribe
          return;
        }

        try {
          counter += 1;
          const proposal = receivedMessage.body.proposal;
          let memoryText = `Proposal #${counter}: ${proposal.description}.\nActions:\n`
          for (let index in proposal.calls) {
            memoryText += `- ${parseInt(index) + 1}: ${proposal.calls[index]}\n` // JS always surprising you
          }

          finalText += memoryText + '\n'

          proposals.push({ proposalNumber: counter, ...proposal });
        } catch (e) {
          console.error("Error inside subscription:", e)
        }
      }
    )

    console.log('Publishing to the general topic');
    // Publish the *first* message to the "general" topic
    await waku.sendMessage(
      intent,
      '', // General intent topic
      message.roomId
    );

    // Sleep 5 seconds to wait for responses
    await (new Promise((resolve) => setTimeout(resolve, 6000)));

    // Persist the proposals
    const proposalManager = new MemoryManager({runtime, tableName: 'proposals' });
    await proposalManager.createMemory({
      userId:    message.userId,
      agentId:   message.agentId,
      roomId:    message.roomId,
      content:   { proposals },
      createdAt: Date.now()
    });

    await callback({ text: `Received ${counter} proposal${counter != 1 ? 's' : ''}:\n\n${finalText}\n\n Which do you want to confirm?` });

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
