import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback } from '@elizaos/core';
import { SwapIntent } from '../lib/types';

export const confirmIntentAction: Action = {
  name: 'CONFIRM_INTENT',
  similes: ['INTENT_CONFIRMATION', 'CONFIRM_SWAP'],
  description: 'Checks if user wants to confirm the intent and proceed with broadcasting',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return /\b(confirm|yes|ok|go|proceed)\b/i.test(text);
  },

  handler: async (runtime: IAgentRuntime, message: Memory, _state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
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
        text: 'Sorry, I could not find a pending intent to confirm. Please create a new swap request.'
      });

      return false;
    }

    const intent: SwapIntent = typeof intentMemory.content.intent === 'object' ? intentMemory.content.intent : {};

    console.log('intent from confirmIntentAction', intent);

    if (intent?.status !== 'pending') {
      callback({
        text: 'The last intent is not pending. Please create a new swap request.'
      });

      return false;
    }

    await intentManager.removeMemory(intentMemory.id);

    const confirmedIntent = {
      ...intent,
      status: 'confirmed'
    };

    await intentManager.createMemory({
      userId: message.userId,
      agentId: message.agentId,
      roomId: message.roomId,
      createdAt: Date.now(),
      unique: true,
      content: {
        ...intentMemory.content,
        action: 'CONFIRM_INTENT',
        intent: confirmedIntent
      }
    });

    console.log('Broadcasting intent', confirmedIntent);

    callback({
      text: 'Broadcasting your swap intent...'
    });

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
