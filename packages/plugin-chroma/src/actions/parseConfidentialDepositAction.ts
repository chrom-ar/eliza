import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, composeContext, generateObject, MemoryManager, elizaLogger } from '@elizaos/core';
import { z } from 'zod';

const confidentialDepositSchema = z.object({
  fromChain: z.string().default('eth-mainnet')
}) as z.ZodType<any>;

const contextTemplate = `# Recent Messages
{{recentMessages}}

Extract the chain for a confidential deposit.
Only determine the chain; other details will be completed separately.
If no chain is specified, default to "eth-mainnet".`;

export const parseConfidentialDepositAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_CONFIDENTIAL_DEPOSIT_INTENT',
  similes: ['CONFIDENTIAL_DEPOSIT_INTENT'],
  description: 'Parses user query and constructs an intent for a confidential deposit by extracting the chain',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    return text.includes('deposit') &&
           (text.includes('confidential') ||
            text.includes('private') ||
            text.includes('secret') ||
            text.includes('anonymous') ||
            text.includes('untraceable') ||
            text.includes('unlinkable'));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown },
    callback: HandlerCallback
  ): Promise<boolean> => {
    const context = composeContext({ state, template: contextTemplate });

    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: confidentialDepositSchema,
      schemaName: 'ConfidentialDepositIntent',
      context
    })).object as z.infer<typeof confidentialDepositSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const { fromChain } = intentData;
    const responseText = `I've created a confidential deposit intent on ${fromChain}. Would you like to confirm this deposit?`;

    const intentManager = new MemoryManager({ runtime, tableName: 'intents' });
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
          type: 'CONFIDENTIAL_DEPOSIT'
        }
      }
    });

    await intentManager.createMemory(newMemory);
    await callback(newMemory.content);
    elizaLogger.info('Confidential deposit intent created', intentData);

    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Make a confidential deposit on Ethereum' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your confidential deposit intent...',
          action: 'PARSE_CONFIDENTIAL_DEPOSIT_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'I want to create a private deposit on Ethereum' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your confidential deposit intent...',
          action: 'PARSE_CONFIDENTIAL_DEPOSIT_INTENT'
        }
      }
    ]
  ]
};
