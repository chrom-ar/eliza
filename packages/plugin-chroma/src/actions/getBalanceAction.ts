import { Action, Memory, IAgentRuntime, HandlerCallback, State } from '@elizaos/core';
import { elizaLogger } from '@elizaos/core';

import { getWalletAndProvider, getBalanceFor } from '../utils/cdp';
import { getDefaultWallet } from '../utils/walletData';

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

      if (!existingWallet || !existingWallet.canSign) {
        callback({
          text: "You don't have a wallet yet. Would you like me to create a new wallet for you?",
          needsWallet: true
        });
        return true;
      }

      const [wallet, provider] = await getWalletAndProvider(runtime, existingWallet.walletId);
      const walletAddress = (await wallet.getDefaultAddress()).getId();
      const balances = await wallet.listBalances();

      // Format response
      let balanceText = `Wallet Address: ${walletAddress}\n`
      for (const [k, v] of balances) {
        balanceText += `- ${v} ${k.toUpperCase()}\n`;
      }

      const networkId = wallet.getNetworkId() as string;
      const extraBalances = EXTRA_BALANCES[networkId] || {};

      for (const [k, v] of Object.entries(extraBalances)) {
        const balance = await getBalanceFor(provider, v, true);

        if (balance && parseFloat(balance.toString()) > 0) {
          balanceText += `- ${balance} ${k}\n`;
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
