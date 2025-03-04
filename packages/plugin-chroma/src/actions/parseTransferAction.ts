import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, composeContext, generateObject, MemoryManager, elizaLogger } from '@elizaos/core';
import { z } from 'zod';

// Define the schema for transfer intent
const transferSchema = z.object({
  amount: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAddress: z.string(),
  fromChain: z.string().default('base-sepolia'),
  recipientAddress: z.string()
});

const contextTemplate = `# Recent Messages
{{recentMessages}}

# Providers data
{{providers}}

Extract transfer intent information from the message.
When no from address or chain is directly specified, use the user's wallet data provided in the context.
If no chain (source or destination) is specified, use "base-sepolia" as the default.`;

export const parseTransferAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_TRANSFER_INTENT',
  similes: ['TRANSFER_INTENT', 'SEND_INTENT'],
  description: 'Parses user query and constructs an intent for a transfer',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    // First check if this is a yield/deposit/invest intent - if so, don't handle it here
    if (text.includes('yield') ||
        text.includes('deposit') ||
        text.includes('invest') ||
        text.includes('earning') ||
        text.includes('interest') ||
        text.includes('strategy')) {
      return false;
    }

    // Then check if it's a transfer intent
    return text.includes('transfer') ||
           text.includes('send') ||
           ((text.includes('to') || text.includes('address')) && /eth|sol|btc|usdc|usdt/i.test(text));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State | undefined, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const context = composeContext({
      state: state,
      template: contextTemplate
    });

    // Extract transfer info using schema validation
    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: transferSchema,
      schemaName: 'TransferIntent',
      context
    })).object as z.infer<typeof transferSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const { amount, fromToken, recipientAddress, fromAddress, fromChain } = intentData;
    const responseText = recipientAddress
      ? `I've created a transfer intent for ${amount} ${fromToken} to ${recipientAddress} on ${fromChain}. Would you like to confirm this transfer?`
      : `I've started creating a transfer intent for ${amount} ${fromToken}. Please provide a recipient address to continue.`;

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
          type: 'TRANSFER'
        }
      }
    });

    await intentManager.createMemory(newMemory);
    await callback(newMemory.content);

    elizaLogger.info('Transfer intent created', intentData);

    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Transfer 1 ETH to 0x1234...5678' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your transfer intent...',
          action: 'PARSE_TRANSFER_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Send 100 USDC to my friend on Solana' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your transfer intent...',
          action: 'PARSE_TRANSFER_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how do I send crypto?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I can help you transfer crypto. Just let me know how much and what token you want to send, and to which address.'
        }
      }
    ]
  ]
};
