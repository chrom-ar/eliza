import { z } from 'zod';
import {
  Action,
  Memory,
  IAgentRuntime,
  HandlerCallback,
  State,
  ModelClass,
  composeContext,
  generateObject,
  MemoryManager
} from '@elizaos/core';

const swapSchema = z.object({
  amount: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAddress: z.string(),
  fromChain: z.string(),
  recipientAddress: z.string(),
  protocols: z.array(z.string()).optional(),
  deadline: z.number().optional()
});

const contextTemplate = `# Recent Messages
{{recentMessages}}

# Providers data
{{providers}}

Extract swap intent information from the message.
When no from address or chain is directly specified, use the user's wallet data provided in the context.
If no chain is specified, use "base-sepolia" as the default.

Protocol Selection Rules:
1. If no protocols are specified, leave an empty array.
2. If protocols are specified, use the protocols from the message, all in lowercase.`;

export const parseSwapAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_SWAP_INTENT',
  similes: ['SWAP_INTENT', 'CREATE_INTENT'],
  description: 'Parses user query and constructs an intent for a swap',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('swap') ||
           (text.includes('from') && text.includes('to') && /eth|sol|btc|usdc|usdt/i.test(text));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const context = composeContext({
      state: state,
      template: contextTemplate
    });

    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: swapSchema,
      schemaName: 'SwapIntent',
      context
    })).object as z.infer<typeof swapSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const responseText = 'I\'ve created a swap intent. Would you like to confirm this swap?'

    const intentManager = new MemoryManager({
      runtime,
      tableName: 'intents'
    });

    await intentManager.removeAllMemories(message.roomId);

    const newMemory: Memory = await intentManager.addEmbeddingToMemory({
      userId: message.userId,
      agentId: message.agentId,
      roomId: message.roomId,
      createdAt: Date.now(),
      unique: true,
      content: {
        text: responseText,
        source: message.content?.source,
        intent: {
          ...intentData,
          type: 'SWAP'
        }
      }
    });

    await intentManager.createMemory(newMemory);
    await callback(newMemory.content);

    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Swap 1 ETH to SOL' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your swap intent...',
          action: 'PARSE_SWAP_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, swap 1 USDC to ETH using Paraswap' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your swap intent...',
          action: 'PARSE_SWAP_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how are you doing?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Doing great!'
        }
      }
    ]
  ]
};
