import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, composeContext, generateObject, MemoryManager, elizaLogger } from '@elizaos/core';
import { z } from 'zod';
import { getDefaultWallet } from '../utils/walletData';

// Define the schema for transfer intent
const yieldSchema = z.object({
  type: z.literal('YIELD'),
  amount: z.string(),
  fromToken: z.string(),
  recipientAddress: z.string(),
  fromChain: z.string().default('base-sepolia'),
});

const contextTemplate = `# Recent Messages
{{recentMessages}}

# Providers data
{{providers}}

Follow the instructions:
1. Extract yield intent information from the message.
2. If no chain is specified, use "base-sepolia" as the default.
3. When extracting the amount, make sure to include the decimals and do not put any other text but the number.
4. Do not include decimals unless the user specifies them.`;

export const parseYieldAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_YIELD_INTENT',
  similes: ['YIELD_INTENT'],
  description: 'Parses user query and constructs a yield intent',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    return text.includes('yield') ||
      text.includes('deposit') ||
      text.includes('invest') ||
      ((text.includes('to') || text.includes('address')) && /eth|usdc|usdt/i.test(text));
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
      schema: yieldSchema,
      schemaName: 'YieldIntent',
      context
    })).object as z.infer<typeof yieldSchema>;
    console.log('intentData', intentData)

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    // Check if user already has a wallet
    const existingWallet = await getDefaultWallet(runtime, message.userId);

    if (!existingWallet) {
      callback({ text: 'We need a wallet to continue. Do you want me to create a wallet?' });
      return false;
    }

    intentData.recipientAddress = existingWallet.address; // model kinda sucks putting the wallet

    const { amount, fromToken, fromChain, recipientAddress } = intentData;
    const responseText = `I've created a yield intent for ${amount} ${fromToken} to ${recipientAddress} on ${fromChain}. \n\n Confirm the intent to receive the best quotas?`

    await callback({ text: responseText }); // this doesn't work (?)

    const intentManager = new MemoryManager({
      runtime,
      tableName: 'intents'
    });

    await intentManager.removeAllMemories(message.roomId);

    const newMemory: Memory = {
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
          type: 'YIELD'
        }
      }
    };

    await intentManager.createMemory(newMemory);
    await callback(newMemory.content);

    elizaLogger.info('Yield intent created', intentData);
    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'I want a yield interest strategy with 1 ETH' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your yield intent...',
          action: 'PARSE_YIELD_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'I want an interest strategy with 100 USDC' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your yield intent...',
          action: 'PARSE_YIELD_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how do I invest in crypto?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I can help you to deposit in a yield strategy. Just let me know how much and what token you want to deposit.'
        }
      }
    ]
  ]
};
