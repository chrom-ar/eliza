import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback } from '@elizaos/core';

export const cancelIntentAction: Action = {
  name: 'CANCEL_INTENT',
  similes: ['INTENT_CANCELLATION', 'CANCEL_SWAP'],
  description: 'Checks if user wants to cancel the intent and remove it from pending',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return /\b(cancel|no|stop|abort|regret)\b/i.test(text);
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    // Retrieve the stored intent
    const intentManager = new MemoryManager({
      runtime,
      tableName: 'intents'
    });

    const [ intentMemory ] = await intentManager.getMemories({
      roomId: message.roomId,
      count: 1,
      unique: true
    });

    if (! intentMemory?.content?.intent) {
      callback({
        text: 'There is no pending intent to cancel.'
      });

      return false;
    }

    await intentManager.removeMemory(intentMemory.id);

    console.log('Canceling intent', intentMemory.content.intent);

    callback({
      text: 'Your swap intent has been canceled.'
    });

    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'No, cancel the swap' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Your swap intent has been canceled.',
          action: 'CANCEL_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'I regret it' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Your swap intent has been canceled.',
          action: 'CANCEL_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'How are you doing?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I am doing great!'
        }
      }
    ]
  ]
};