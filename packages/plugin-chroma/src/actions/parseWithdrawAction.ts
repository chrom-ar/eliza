import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, composeContext, generateObject, MemoryManager, elizaLogger } from '@elizaos/core';
import { z } from 'zod';
import { getDefaultWallet } from '../utils/walletData';

// Define the schema for withdrawal intent
const withdrawSchema = z.object({
  type: z.literal('WITHDRAW'),
  amount: z.string(),
  fromToken: z.string(),
  fromAddress: z.string(),
  fromChain: z.string().nullable(),
  protocol: z.string().nullable(),
});

// Type for the schema to avoid type errors
type WithdrawSchema = z.infer<typeof withdrawSchema>;

const contextTemplate = `# Recent Messages
{{recentMessages}}

# Providers data
{{providers}}

Follow the instructions:
1. Extract withdrawal intent information from the message.
2. For network/chain extraction:
   - You MUST extract the exact network/chain if mentioned by the user in their message
   - If no network is mentioned at all, set fromChain to null
   - Never make up a default value
3. For protocol extraction:
   - You MUST extract the exact protocol if mentioned by the user in their message (e.g., Aave, Compound, Uniswap)
   - If no protocol is mentioned at all, set protocol to null
   - Never make up a default value
4. When extracting the amount, make sure to include the decimals and do not put any other text but the number.
5. Do not include decimals unless the user specifies them.
6. Use the "compact" format for the chain, so "Optimism Sepolia" becomes "opt-sepolia".`;

export const parseWithdrawAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_WITHDRAW_INTENT',
  similes: ['WITHDRAW_INTENT'],
  description: 'Parses user query and constructs a withdrawal intent',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    return text.includes('withdraw') ||
      text.includes('remove') ||
      text.includes('redeem') ||
      text.includes('take out') ||
      text.includes('pull out') ||
      (text.includes('aave') && (text.includes('get') || text.includes('retrieve')));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State | undefined, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const context = composeContext({
      state: state,
      template: contextTemplate
    });

    // Extract withdrawal info using schema validation
    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: withdrawSchema as z.ZodType<any>,
      schemaName: 'WithdrawIntent',
      context
    })).object as WithdrawSchema;
    console.log('intentData', intentData)

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

    intentData.fromAddress = existingWallet.address; // Ensure we use the user's wallet address
    // We also need recipientAddress and recipientChain for the GeneralMessage format
    const recipientAddress = existingWallet.address;
    const recipientChain = intentData.fromChain;

    const { amount, fromToken, fromChain, fromAddress, protocol } = intentData;
    const responseText = `I've created a withdraw intent for ${amount} ${fromToken} from ${fromAddress} on ${fromChain}${protocol ? ` using ${protocol}` : ''}. \n\n Confirm the intent to proceed with the withdrawal?`

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
          recipientAddress,
          recipientChain,
          type: 'WITHDRAW'
        }
      }
    };

    await intentManager.createMemory(newMemory);
    await callback(newMemory.content);

    elizaLogger.info('Withdraw intent created', intentData);
    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'I want to withdraw 1 ETH from my Aave deposit' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your withdrawal intent...',
          action: 'PARSE_WITHDRAW_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'I need to remove 100 USDC from my deposits' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your withdrawal intent...',
          action: 'PARSE_WITHDRAW_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how do I get my funds back from Aave?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I can help you withdraw your deposits from Aave. Just let me know how much and which token you want to withdraw.'
        }
      }
    ]
  ]
};
