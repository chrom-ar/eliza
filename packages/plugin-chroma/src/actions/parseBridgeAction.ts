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
  MemoryManager,
} from '@elizaos/core';

const bridgeSchema = z.object({
  amount: z.string(),
  fromToken: z.string(),
  fromAddress: z.string(),
  fromChain: z.string(),
  recipientAddress: z.string(),
  recipientChain: z.string(),
  protocols: z.array(z.string()).optional(),
  deadline: z.number().optional()
});

const contextTemplate = `# Recent Messages
{{recentMessages}}

# User Wallet Data
{{providers}}

Extract bridge intent information from the user's message to facilitate USDC transfers between chains.

## Available User Data
The User Wallet Data section above contains:
- List of user's EVM addresses (format: 0x...)
- List of user's Solana addresses (Base58 format)
- List of user's preferred chains

## Bridge Requirements
Token: ONLY USDC is supported for bridging operations

Chain Rules:
1. Default source and destination chain is "ethereum" if not specified
2. Testnet Rules:
   - If "sepolia" is mentioned alone (e.g., "from sepolia"), use "sepolia" as the chain name
   - If "sepolia" is mentioned with other chains (e.g., "from sepolia to optimism"):
     * Add "-sepolia" suffix to ALL chains (e.g., fromChain: "sepolia", toChain: "optimism-sepolia")
   - Valid testnet chains: "sepolia", "optimism-sepolia", "arbitrum-sepolia", "base-sepolia", "polygon-sepolia"
   - Testnets and mainnet chains cannot be mixed in the same transaction

Address Selection Rules:
1. If address not specified in message:
   - For EVM chains: Use user's 0x... address from wallet data
   - For Solana: Use user's Base58 address from wallet data
2. If multiple addresses available, select the one matching the chain type

Protocols Selection Rules:
1. Check in the context "# User wallet data" if protocols are specified.
2. If protocols are specified  in the message, use them, all in lowercase.
3. If no protocols are found or specified, leave protocols with an empty array.

## Required Output Fields
1. amount: (number) USDC quantity to bridge
2. fromToken: Must be "USDC"
3. fromChain: Source chain name (use rules above)
4. fromAddress: Source wallet address (use rules above)
5. recipientChain: Destination chain name (use rules above)
6. recipientAddress: Destination wallet address (use rules above)
7. protocols: Array of protocols to use for the bridge (e.g., ["hop", "across"])
8. deadline: (optional) Transaction deadline timestamp`;

export const parseBridgeAction: Action = {
  suppressInitialMessage: true,
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

    const { amount, fromToken, fromChain, recipientChain, protocols } = intentData;
    const responseText = `I've created a bridge intent for ${amount} ${fromToken} from ${fromChain} to ${recipientChain}.
${protocols.length > 0 ? `Protocols: ${protocols.join(', ')}` : ''}
Would you like to confirm this bridge operation?`;

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
          type: 'BRIDGE'
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
        content: { text: 'Can you send 100 USDC from Base to Arbitrum?' }
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
        content: { text: 'Transfer 50 USDC across chains from Polygon to Base using wormhole, hop and across' }
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
