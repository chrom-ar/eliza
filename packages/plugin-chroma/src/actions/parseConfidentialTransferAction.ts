import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, composeContext, generateObject, MemoryManager, elizaLogger } from '@elizaos/core';
import { z } from 'zod';

// Define the schema for confidential transfer intent extracting only the chain
const confidentialTransferSchema = z.object({
  fromChain: z.string().default('base-sepolia')
}) as z.ZodType<any>;

const contextTemplate = `# Recent Messages
{{recentMessages}}

Extract the chain for a confidential transfer.
Only determine the chain; other details will be completed separately.
If no chain is specified, default to "base-sepolia".`;

export const parseConfidentialTransferAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_CONFIDENTIAL_TRANSFER_INTENT',
  similes: ['CONFIDENTIAL_TRANSFER_INTENT'],
  description: 'Parses user query and constructs an intent for a confidential transfer by extracting the chain',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    // Exclude yield/deposit/invest intents
    if (text.includes('yield') ||
        text.includes('deposit') ||
        text.includes('invest') ||
        text.includes('earning') ||
        text.includes('interest') ||
        text.includes('strategy')) {
      return false;
    }

    // Identify transfer intent
    return text.includes('transfer') ||
           text.includes('send') ||
           text.includes('confidential') ||
           text.includes('private') ||
           text.includes('secret') ||
           text.includes('anonymous') ||
           text.includes('untraceable') ||
           text.includes('unlinkable');
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State | undefined, _options: { [key: string]: unknown }, callback: HandlerCallback): Promise<boolean> => {
    const context = composeContext({
      state: state,
      template: contextTemplate
    });

    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: confidentialTransferSchema,
      schemaName: 'ConfidentialTransferIntent',
      context
    })).object as z.infer<typeof confidentialTransferSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const { fromChain } = intentData;
    const responseText = `I've created a confidential transfer intent on ${fromChain}. Would you like to confirm this transfer?`;

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
          type: 'CONFIDENTIAL_TRANSFER'
        }
      }
    });

    await intentManager.createMemory(newMemory);
    await callback(newMemory.content);

    elizaLogger.info('Confidential transfer intent created', intentData);

    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Transfer crypto on Ethereum' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your confidential transfer intent...',
          action: 'PARSE_CONFIDENTIAL_TRANSFER_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Send crypto to chain Solana' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your confidential transfer intent...',
          action: 'PARSE_CONFIDENTIAL_TRANSFER_INTENT'
        }
      }
    ]
  ]
};
