import { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import Handlebars from 'handlebars';
import { getAllWallets, getDefaultWallet, getWalletType, getWalletsByType } from '../utils/walletData';

/**
 * The final message if all data is collected
 */
const allDataCollectedTemplate = Handlebars.compile(`
# User wallet data:

- EVM addresses: {{evmAddresses}}
- Solana ONLY addresses: {{solanaAddresses}}
- Preferred chains: {{chains}}
- Default wallet: {{defaultWallet}} ({{defaultWalletType}})

Use this when you need to know the user's wallet data and no other context is given.`);

export const walletProvider: Provider = {
  /**
   * Provide context about the user's current wallet data,
   * including instructions if data is missing.
   */
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // Get all wallets
    const wallets = await getAllWallets(runtime, message.userId);
    const defaultWallet = await getDefaultWallet(runtime, message.userId);

    // If no wallets found, provide instructions
    if (wallets.length === 0) {
      return `
We have no wallet data for this user yet.

Instructions for collecting missing data:
- Ask the user to share their blockchain wallet addresses. The user may have multiple addresses across different chains.
- Ask the user which blockchain networks they primarily interact with. Examples include Ethereum, BSC, Polygon, or Solana.
- If the user asks for a wallet to be created, then omit the previous questions.
`.trim();
    }

    // Categorize addresses by type
    const evmAddresses = (await getWalletsByType(runtime, message.userId, 'evm'))
      .map(wallet => wallet.address);

    const solanaAddresses = (await getWalletsByType(runtime, message.userId, 'solana'))
      .map(wallet => wallet.address);

    // Collect all unique chains
    const allChains = new Set<string>();

    wallets.forEach(wallet => {
      wallet.chains.forEach(chain => allChains.add(chain));
    });

    const chainsStr = Array.from(allChains).join(', ');
    const defaultWalletType = defaultWallet ? getWalletType(defaultWallet) : 'none';

    // Present the wallet information
    return allDataCollectedTemplate({
      evmAddresses: evmAddresses.length ? evmAddresses.join(', ') : 'None',
      solanaAddresses: solanaAddresses.length ? solanaAddresses.join(', ') : 'None',
      chains: chainsStr || 'None',
      defaultWallet: defaultWallet ? defaultWallet.address : 'None',
      defaultWalletType
    }).trim();
  },
};
