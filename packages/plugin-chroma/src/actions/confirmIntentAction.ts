import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
import { WakuClient } from '../lib/waku-client';

import { getStoredWallet } from '../utils/walletData';
import { simulateTxs } from '../utils/simulation';
import { storeProposals, formatProposalText } from '../utils/proposal';

export const confirmIntentAction: Action = {
  suppressInitialMessage: true,
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

    const waku = await WakuClient.new(runtime);

    let counter = 0
    let proposals = []
    let finalText = ''
    const expiration = Date.now() + 6000;

    const walletAddr = (await getStoredWallet(runtime, message.userId)).address

    // Subscribe to the room to receive the proposals
    await waku.subscribe(
      message.roomId,
      async (receivedMessage) => {
        if (Date.now() > expiration) {
          // TODO unsubscribe
          return;
        }

        try {
          counter += 1;
          const proposal = receivedMessage.body.proposal;
          proposal.number = counter;
          let memoryText = formatProposalText(proposal);

          // @ts-ignore
          const { error, results } = await simulateTxs(runtime, walletAddr, proposal.transactions || [proposals.transaction])

          if (error) {
            memoryText += `\nSimulation error: ${error}\n`
          } else {
            memoryText += `\nSimulation:\n`
            for (let index in results) {
              memoryText += `Tx #${parseInt(index) + 1}:\n`
              memoryText += (results[index].error || results[index].summary.join("\n")) + "\n"
              memoryText += `Link: ${results[index].link}\n`
            }
          }

          finalText += memoryText

          proposals.push({ proposalNumber: counter, simulation: results, ...proposal });
        } catch (e) {
          console.error("Error inside subscription:", e)
        }
      }
    )

    // Publish the *first* message to the "general" topic
    await waku.sendMessage(
      intent,
      '', // General intent topic
      message.roomId
    );

    // Sleep 5 seconds to wait for responses
    const timeToSleep = process.env.NODE_ENV == 'test' ? 500 : 6000;
    await (new Promise((resolve) => setTimeout(resolve, timeToSleep)));

    if (proposals.length == 0) {
      callback({ text: 'No proposals received. Do you want to try again?' });
      return false;
    }

    // Remove the old memory
    await intentManager.removeAllMemories(message.roomId);

    // Persist the proposals
    await storeProposals(runtime, message.userId, message.roomId, {
      proposals,
      createdAt: Date.now()
    });

    await callback({ text: `Received ${counter} proposal${counter != 1 ? 's' : ''}:\n\n${finalText}\n\n Which do you want to confirm?`, proposals});

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
