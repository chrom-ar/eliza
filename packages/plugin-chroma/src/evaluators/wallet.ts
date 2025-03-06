import { Evaluator, IAgentRuntime, Memory, ModelClass } from '@elizaos/core';
import { generateObject } from '@elizaos/core';
import { z } from 'zod';
import { getAllWallets, addWallet, WalletType } from '../utils/walletData';

/**
 * An evaluator that tries to parse a user's message for wallet data
 * and store it in the cache.
 */
export const walletEvaluator: Evaluator = {
  name: 'GET_WALLET_DATA',
  similes: ['EXTRACT_WALLET_DATA'],
  description: 'Collect wallet addresses and chains from the user message',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const wallets = await getAllWallets(runtime, message.userId);

    // If we already have wallet data, don't need to extract more
    if (wallets.length > 0) {
      return false;
    }

    // No wallets found, try to extract from message
    await walletEvaluator.handler(runtime, message);
    return true;
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    const walletExtractionSchema = z.object({
      wallets: z.array(z.object({
        address: z.string(),
        chains: z.array(z.string()),
      }))
    });

    const prompt = `
    Extract wallet addresses and their associated blockchain networks from this message.

    Guidelines:
    - For each wallet address found, identify which blockchain networks/chains it belongs to
    - If several chains are mentioned for an address, add all of them to the chains array, do not pick and choose
    - EVM addresses start with "0x" and can be used on Ethereum, Polygon, BSC, Arbitrum, Optimism, etc.
    - Solana addresses don't start with "0x" and are used on the Solana blockchain
    - If the user do not mention sepolia or testnet, then use the mainnet for the chains, that is mostly just the name of the chain
    - If no specific chains are mentioned for an address, use the following defaults:
      * For EVM addresses (0x...): ["opt-sepolia", "base-sepolia", "arb-sepolia"]
      * For Solana addresses: ["solana"]
    - Return an empty array if no wallet addresses are found

    Format the response as an array of wallet objects, each with:
    - address: The wallet address string
    - chains: Array of blockchain networks this address is used on

    User message:
    \`\`\`
    ${message.content.text}
    \`\`\`
    `;

    // Extract wallet info using AI
    const extractionResult = await generateObject({
      runtime,
      modelClass: ModelClass.MEDIUM,
      schema: walletExtractionSchema,
      context: prompt
    });

    const extractedData = extractionResult.object as z.infer<typeof walletExtractionSchema>;
    let success = false;

    // Add each extracted wallet
    if (extractedData.wallets && extractedData.wallets.length > 0) {
      for (const wallet of extractedData.wallets) {
        await addWallet(runtime, message.userId, {
          address: wallet.address,
          chains: wallet.chains,
          canSign: false
        });
        success = true;
      }
    }

    // Return result
    const resultObj = {
      success,
      data: {
        walletsAdded: extractedData.wallets?.length || 0,
        wallets: extractedData.wallets || []
      },
      message: success
        ? `Added ${extractedData.wallets.length} wallet(s) to storage`
        : 'No wallet data extracted',
    };

    return JSON.stringify(resultObj);
  },

  examples: [
    {
      context: 'User shares a single wallet address with chains',
      messages: [
        {
          user: 'Alice',
          content: {
            text: 'My address is 0xABc1234 and I use it on Ethereum and BSC',
          },
        },
      ],
      outcome: '{"success":true,"data":{"walletsAdded":1,"wallets":[{"address":"0xABc1234","chains":["ethereum","bsc"]}]},"message":"Added 1 wallet(s) to storage"}',
    },
    {
      context: 'User shares multiple wallet addresses',
      messages: [
        {
          user: 'Alice',
          content: {
            text: 'I have 0xABc1234 on Polygon and also yjAgent123 for Solana',
          },
        },
      ],
      outcome: '{"success":true,"data":{"walletsAdded":2,"wallets":[{"address":"0xABc1234","chains":["polygon"]},{"address":"yjAgent123","chains":["solana"]}]},"message":"Added 2 wallet(s) to storage"}',
    },
  ],
};
