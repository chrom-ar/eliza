import { Action, Memory, IAgentRuntime, HandlerCallback, State } from '@elizaos/core';
import { elizaLogger } from '@elizaos/core';

import { getWalletAndProvider, createWallet } from '../utils/cdp';
import { getDefaultWallet, addWallet } from '../utils/walletData';

export const createWalletAction: Action = {
  suppressInitialMessage: true,
  name: 'CREATE_WALLET',
  similes: ['INITIALIZE_WALLET', 'SETUP_WALLET', 'GET_WALLET'],
  description: 'Creates or retrieves a CDP wallet for the user',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('wallet') || text.includes('create') || text.includes('setup') ||
      text.includes('yes');
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    try {
      // Check if user already has a wallet
      const existingWallet = await getDefaultWallet(runtime, message.userId);

      let wallet;
      if (existingWallet && existingWallet.canSign) {
        // Wallet exists, try to import it
        try {
          [wallet] = await getWalletAndProvider(runtime, existingWallet.walletId);

          const walletAddress = (await wallet.getDefaultAddress()).id;
          callback({
            text: `Found your existing wallet with address: ${walletAddress}`,
            walletAddress,
            walletId: existingWallet.walletId
          });

          return true;
        } catch (error) {
          console.log(error)
          elizaLogger.error('Error importing existing wallet:', error);

          callback({
            text: `Error importing existing wallet: ${error}`,
          });

          return true;
        }
      }

      // Create new wallet
      wallet = await createWallet(runtime);
      const walletId = wallet.getId();
      const walletAddress = (await wallet.getDefaultAddress()).id;
      const networkId = wallet.getNetworkId();

      try {
        // Fund the wallet TMP only testnet
        await (await wallet.faucet()).wait();
        await (await wallet.faucet('usdc')).wait();
      } catch (error) {
        console.log(error)
      }

      // Store wallet data using the simplified API with walletId
      await addWallet(runtime, message.userId, {
        address: walletAddress,
        chains: [networkId],
        canSign: true,
        walletId
      });

      callback({
        text: `Successfully created a new wallet!\nAddress: ${walletAddress}\nNetwork: ${networkId}`,
        walletAddress,
        walletId
      });

      return true;
    } catch (error) {
      console.log(error)
      elizaLogger.error('Error in createWalletAction:', error);
      callback({
        text: `Failed to create wallet: ${error.message}`,
        error: error.message
      });
      return false;
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Create a wallet for me' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Creating your wallet...',
          action: 'CREATE_WALLET'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Setup my wallet' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Setting up your wallet...',
          action: 'CREATE_WALLET'
        }
      }
    ]
  ]
};
