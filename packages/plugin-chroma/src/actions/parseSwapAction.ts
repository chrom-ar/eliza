import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, embed, generateObject, MemoryManager } from '@elizaos/core';
import { z } from 'zod';

// Define the schema for swap intent
const swapSchema = z.object({
  amount: z.string(),
  sourceToken: z.string(),
  sourceChain: z.string(),
  destinationToken: z.union([z.string(), z.array(z.string())]),
  destinationChain: z.string(),
  deadline: z.number().optional()
});

export const parseSwapAction: Action = {
  name: 'PARSE_SWAP_INTENT',
  similes: ['SWAP_INTENT', 'CREATE_INTENT'],
  description: 'Parses user query and constructs a GaslessCrossChainIntent JSON for a swap',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('swap') ||
           (text.includes('from') && text.includes('to') && /eth|sol|btc|usdc|usdt/i.test(text));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, _state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    // Extract swap info with schema validation
    const intentData = await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: swapSchema,
      schemaName: 'SwapIntent',
      schemaDescription: 'Extract swap intent information from the message',
      context: message.content.text
    }) as z.infer<typeof swapSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    // Store the intent in memory manager
    const intentManager = new MemoryManager({
      runtime,
      tableName: 'intents'
    });

    await intentManager.removeAllMemories(message.roomId);

    const { amount, sourceToken, destinationToken } = intentData;
    const destination = Array.isArray(destinationToken) ? destinationToken.join(', ') : destinationToken;
    const responseText = `I've created a swap intent for ${amount} ${sourceToken} to ${destination}. Would you like to confirm this swap?`;

    const newMemory: Memory = await intentManager.addEmbeddingToMemory({
      userId: message.userId,
      agentId: message.agentId,
      roomId: message.roomId,
      createdAt: Date.now(),
      unique: true,
      content: {
        text: responseText,
        action: 'PARSE_SWAP_INTENT',
        source: message.content?.source,
        intent: {
          ...intentData,
          status: 'pending'
        }
      }
    });

    console.log('intent from parseSwapAction', newMemory.content.intent);

    await intentManager.createMemory(newMemory);

    callback(newMemory.content);

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
        content: { text: 'Hey {{user2}}, swap 1 USDC to ETH' }
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