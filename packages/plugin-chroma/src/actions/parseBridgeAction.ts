import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, composeContext, generateObject, MemoryManager } from '@elizaos/core';
import { z } from 'zod';

const bridgeSchema = z.object({
  amount: z.string(),
  fromToken: z.string(),
  fromAddress: z.string(),
  fromChain: z.string(),
  recipientAddress: z.string(),
  recipientChain: z.string(),
  deadline: z.number().optional()
});

const contextTemplate = `# Recent Messages
{{recentMessages}}

# Providers data
{{providers}}

Extract bridge intent information from the message.
When no from address or chain is directly specified, use the user's wallet data provided in the context.
If no chain (source or destination) is specified, use "ethereum" as the default.
The bridge only supports USDC token.`;

export const parseBridgeAction: Action = {
  name: 'PARSE_BRIDGE_INTENT',
  similes: ['BRIDGE_INTENT', 'CROSS_CHAIN_INTENT'],
  description: 'Parses user query and constructs a GaslessCrossChainIntent JSON for a bridge operation',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('bridge') ||
           ((text.includes('from') && text.includes('to')) && 
            (text.includes('chain') || text.includes('network') || /sepolia|optimism|arbitrum|base|polygon/i.test(text)));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const context = composeContext({
      state: state,
      template: contextTemplate
    });

    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: bridgeSchema,
      schemaName: 'BridgeIntent',
      context
    })).object as z.infer<typeof bridgeSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const intentManager = new MemoryManager({
      runtime,
      tableName: 'intents'
    });

    await intentManager.removeAllMemories(message.roomId);

    const { amount, fromToken, fromChain, recipientChain } = intentData;
    const responseText = `I've created a bridge intent for ${amount} ${fromToken} from ${fromChain} to ${recipientChain}. Would you like to confirm this bridge operation?`;

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
          status: 'pending'
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
        content: { text: 'Bridge 1 USDC from Sepolia to Optimism Sepolia' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your bridge intent...',
          action: 'PARSE_BRIDGE_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Send 100 USDC from Base to Arbitrum' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your bridge intent...',
          action: 'PARSE_BRIDGE_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Transfer 50 USDC across chains from Polygon to Base' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your bridge intent...',
          action: 'PARSE_BRIDGE_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how do I move my USDC between networks?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I can help you bridge USDC between different networks. Just let me know how much USDC you want to bridge and between which networks.'
        }
      }
    ]
  ]
};
