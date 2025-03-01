import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, generateObject } from '@elizaos/core';
import { elizaLogger } from '@elizaos/core';
import Handlebars from 'handlebars';
import { z } from 'zod';

import { getWalletAndProvider, getBalanceFor } from '../utils/cdp';
import { getDefaultWallet } from '../utils/walletData';
import { getBalances } from '../utils/balance';

// Network extraction prompt template
const networkExtractionPrompt = Handlebars.compile(`
Extract the blockchain network from this message if specified.
Common networks are: base-sepolia, opt-sepolia, arb-sepolia, ethereum, solana, etc.
If no network is specified, return null or empty string.

User message:
\`\`\`
{{message}}
\`\`\`
`);

// For showcase purposes
const EXTRA_BALANCES: Record<string, Record<string, string>> = {
  "base-sepolia": {
    ["Aave-USDC"]: "0xf53b60f4006cab2b3c4688ce41fd5362427a2a66"
  }
};

export const getBalanceAction: Action = {
  suppressInitialMessage: true,
  name: 'GET_BALANCE',
  similes: [
    'CHECK_BALANCE',
    'VIEW_BALANCE',
    'SHOW_BALANCE',
    'CHECK_BALANCES',
    'VIEW_BALANCES',
    'SHOW_BALANCES',
    "GET_WALLET",
    "SHOW_WALLET"
  ],
  description: 'Gets ETH and USDC balance for the user\'s CDP wallet',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('balance') || text.includes('check') ||
           text.includes('balances') || text.includes('amount') ||
           text.includes('money') ||
           text.includes('how much') || text.includes('funds') ||
           (text.includes('wallet') && text.includes('show'));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, _state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    try {
      // Get user's wallet from cache
      const existingWallet = await getDefaultWallet(runtime, message.userId);

      if (!existingWallet) {
        callback({
          text: "You don't have a wallet yet. Would you like me to create a new wallet for you?",
          needsWallet: true
        });
        return true;
      }

      let walletAddress;
      let networkId;
      let balanceText = '';

      // Handle case with just an address (no CDP wallet)
      if (!existingWallet.walletId) {
        walletAddress = existingWallet.address;
        const networkSchema = z.object({
          network: z.string().optional().describe('The blockchain network specified in the message')
        });

        const context = networkExtractionPrompt({
          message: message.content.text
        });

        const extractedData = await generateObject({
          runtime,
          modelClass: ModelClass.SMALL,
          schema: networkSchema,
          context
        });

        const extractedNetwork = (extractedData.object as z.infer<typeof networkSchema>).network;

        if (existingWallet.chains && existingWallet.chains.length === 0) {
          callback({
            text: "Please, detail a preferred network for your wallet."
          });

          return true;
        }

        // Use extracted network if available, otherwise default to the first -sepolia chain
        // TODO: Change this when going live
        if (extractedNetwork) {
          networkId = extractedNetwork.toLowerCase();
        } else {
          networkId = existingWallet.chains.find(chain => chain.toLowerCase().includes('-sepolia')) || existingWallet.chains[0];
        }

        balanceText = `Wallet Address: ${walletAddress}\nNetwork: ${networkId}\n`;

        const tokenBalances = await getBalances(walletAddress, networkId, ['USDC', 'aUSDC']);

        for (const balance of tokenBalances) {
          balanceText += `- ${balance.balance} ${balance.symbol}\n`;
        }
      } else {
        const [wallet, provider] = await getWalletAndProvider(runtime, existingWallet.walletId);

        walletAddress = (await wallet.getDefaultAddress()).getId();
        networkId = wallet.getNetworkId() as string;

        // Format response header
        balanceText = `Wallet Address: ${walletAddress}\nNetwork: ${networkId}\n`;

        // Get balances from CDP wallet
        const balances = await wallet.listBalances();
        for (const [k, v] of balances) {
          balanceText += `- ${v} ${k.toUpperCase()}\n`;
        }

        // Add extra balances (Aave tokens)
        const extraBalances = EXTRA_BALANCES[networkId] || {};
        for (const [k, v] of Object.entries(extraBalances)) {
          const balance = await getBalanceFor(provider, v, true);
          if (balance && parseFloat(balance.toString()) > 0) {
            balanceText += `- ${balance} ${k}\n`;
          }
        }
      }

      callback({ text: balanceText });
      return true;
    } catch (error) {
      console.error(error);
      elizaLogger.error('Error in getBalanceAction:', error);
      callback({
        text: `Failed to get wallet balance: ${error.message}`,
        error: error.message
      });
      return false;
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'What\'s my balance?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Checking your wallet balance...',
          action: 'GET_BALANCE'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'How much ETH do I have?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Let me check your balances...',
          action: 'GET_BALANCE'
        }
      }
    ]
  ]
};
