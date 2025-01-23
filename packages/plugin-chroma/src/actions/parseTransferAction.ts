import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, generateObject, MemoryManager } from '@elizaos/core';
import { z } from 'zod';

// Define the schema for transfer intent
const transferSchema = z.object({
  amount: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAddress: z.string(),
  fromChain: z.string(),
  recipientAddress: z.string(),
  recipientChain: z.string(),
  deadline: z.number().optional()
});

export const parseTransferAction: Action = {
  name: 'PARSE_TRANSFER_INTENT',
  similes: ['TRANSFER_INTENT', 'SEND_INTENT'],
  description: 'Parses user query and constructs a GaslessCrossChainIntent JSON for a transfer',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    return text.includes('transfer') ||
           text.includes('send') ||
           ((text.includes('to') || text.includes('address')) && /eth|sol|btc|usdc|usdt/i.test(text));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State | undefined, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const schemaDescription = `
    Extract transfer intent information from the message.
    If no chain (source or destination) is specified, use "ethereum" as the default.
    If no from address is specified, use this one: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    `;
    // Extract transfer info using schema validation
    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: transferSchema,
      schemaName: 'TransferIntent',
      schemaDescription,
      context: message.content.text
    })).object as z.infer<typeof transferSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const { amount, fromToken, recipientAddress, recipientChain, fromAddress, fromChain } = intentData;
    const responseText = recipientAddress
      ? `I've created a transfer intent for ${amount} ${fromToken} to ${recipientAddress} on ${recipientChain}. Would you like to confirm this transfer?`
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
        action: 'PARSE_TRANSFER_INTENT',
        source: message.content?.source,
        intent: {
          ...intentData,
          status: 'pending'
        }
      }
    });

    await intentManager.createMemory(newMemory);
    callback(newMemory.content);

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
