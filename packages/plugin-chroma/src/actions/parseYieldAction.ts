import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, composeContext, generateObject, MemoryManager, elizaLogger } from '@elizaos/core';
import { z } from 'zod';
import { getDefaultWallet } from '../utils/walletData';

// Define the schema for yield intent
const yieldSchema = z.object({
  type: z.literal('YIELD'),
  amount: z.string(),
  fromToken: z.string(),
  recipientAddress: z.string(),
  fromChain: z.string().nullable()
}) as z.ZodType<any>;

const contextTemplate = `# Recent Messages
{{recentMessages}}

# Providers data
{{providers}}

Follow the instructions:
1. Extract yield intent information from the message.
2. For network/chain extraction:
   - You MUST extract the exact network/chain if mentioned by the user in their message
   - If no network is mentioned at all, set fromChain to null
   - Never make up a default value
3. When extracting the amount, make sure to include the decimals and do not put any other text but the number.
4. Do not include decimals unless the user specifies them.
5. Use the "compact" format for the chain, so "Optimism Sepolia" becomes "opt-sepolia".`;

export const parseYieldAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_YIELD_INTENT',
  similes: ['YIELD_INTENT'],
  description: 'Parses user query and constructs a yield intent',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    // Check for explicit yield-related keywords
    const hasYieldKeywords = text.includes('yield') ||
      text.includes('deposit') ||
      text.includes('invest') ||
      text.includes('earning') ||
      text.includes('interest') ||
      text.includes('strategy');

    // If there are yield keywords or more ambiguous phrases that suggest yield rather than transfer
    if (hasYieldKeywords) {
      return true;
    }

    // Specifically capture "deposit X into Y" patterns but not simple transfer patterns
    if (text.includes('deposit') && /eth|usdc|usdt/i.test(text)) {
      return true;
    }

    // Avoid triggering on messages that are clearly transfer intents
    if (text.includes('transfer') || text.includes('send to')) {
      return false;
    }

    return false;
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

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    // Set default chain only if not extracted
    if (!intentData.fromChain) {
      intentData.fromChain = "base-sepolia";
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
        content: { text: 'I want a to deposit 1 ETH in a yield strategy' }
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
