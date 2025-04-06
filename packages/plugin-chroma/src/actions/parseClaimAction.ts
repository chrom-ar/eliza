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

const claimSchema = z.object({
  fromChain: z.string(),
  recipientChain: z.string(),
  transactionHash: z.string(),
  // protocol: z.string(), // TODO: Add this back when other protocols are supported
  deadline: z.number().optional()
});

const contextTemplate = `# Recent Messages
{{recentMessages}}

# User Wallet Data
{{providers}}

Extract claim intent information from the user's message to facilitate cross-chain claim operations.

## Available User Data
The User Wallet Data section above contains:
- List of user's EVM addresses (format: 0x...)
- List of user's Solana addresses (Base58 format)
- List of user's preferred chains

## Claim Requirements
Token: ONLY USDC claims are supported

Chain Rules:
1. Default source and destination chain is "ethereum" if not specified
2. Testnet Rules:
   - If "sepolia" is mentioned alone (e.g., "from sepolia"), use "sepolia" as the chain name
   - If "sepolia" is mentioned with other chains (e.g., "from sepolia to optimism"):
     * Add "-sepolia" suffix to ALL chains (e.g., fromChain: "sepolia", toChain: "optimism-sepolia")
   - Valid testnet chains: "sepolia", "optimism-sepolia", "arbitrum-sepolia", "base-sepolia", "polygon-sepolia"
   - Testnets and mainnet chains cannot be mixed in the same transaction

## Required Output Fields
1. fromChain: Source chain name (use rules above)
2. recipientChain: Destination chain name (use rules above)
3. transactionHash: The transaction hash to claim from
4. deadline: (optional) Transaction deadline timestamp`;

export const parseClaimAction: Action = {
  suppressInitialMessage: true,
  name: 'PARSE_CLAIM_INTENT',
  similes: ['CLAIM_INTENT', 'CROSS_CHAIN_CLAIM'],
  description: 'Parses user query and constructs a GaslessCrossChainClaim JSON for a claim operation',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('claim') ||
           ((text.includes('transaction') || text.includes('tx')) && 
            (text.includes('hash') || /0x[a-f0-9]{64}/i.test(text)));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const context = composeContext({
      state: state,
      template: contextTemplate
    });

    const intentData = (await generateObject({
      runtime,
      modelClass: ModelClass.SMALL,
      schema: claimSchema,
      schemaName: 'ClaimIntent',
      context
    })).object as z.infer<typeof claimSchema>;

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const { fromChain, recipientChain, transactionHash } = intentData;
    const responseText = `I've created a claim intent for transaction ${transactionHash} from ${fromChain} to ${recipientChain}.
Would you like to confirm this claim operation?`;

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
          type: 'CLAIM'
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
        content: { text: 'I want to claim the transaction 0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef made on Base Sepolia for Optimism Sepolia' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your claim intent...',
          action: 'PARSE_CLAIM_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Can you claim my transaction hash 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789 from Base to Arbitrum?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your claim intent...',
          action: 'PARSE_CLAIM_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how do I claim my cross-chain transaction?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I can help you claim your cross-chain transaction. Just provide me with the transaction hash and the chains involved (source and destination).'
        }
      }
    ]
  ]
};
