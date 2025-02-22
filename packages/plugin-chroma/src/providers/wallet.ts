import { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import Handlebars from 'handlebars';
import { getWalletCache, categorizeAddresses, getStoredWallet } from '../utils/walletData';

/**
 * This template is an example.
 * We embed placeholders for address and chains,
 * so the code can fill them in at runtime.
 */
const summaryTemplate = Handlebars.compile(`
We have the following user wallet data so far:
- EVM addresses: {{evmAddresses}}
- Solana addresses: {{solanaAddresses}}
- Preferred chains: {{chains}}
`);

/**
 * The final message if all data is collected
 */
const allDataCollectedTemplate = Handlebars.compile(`
# User wallet data:

- EVM addresses: {{evmAddresses}}
- Solana ONLY addresses: {{solanaAddresses}}
- Preferred chains: {{chains}}

Use this when you need to know the user's wallet data and no other context is given.`);

export const walletProvider: Provider = {
  /**
   * Provide context about the user's current wallet data,
   * including instructions if data is missing.
   */
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // 1. Get wallet data from cache
    const cacheObj = await getWalletCache(runtime, message.userId);

    // 2. Get stored wallet if exists
    const storedWallet = await getStoredWallet(runtime, message.roomId);

    if (storedWallet) {
      if (!cacheObj.addresses) {
        cacheObj.addresses = storedWallet.address;
      } else if (!cacheObj.addresses.includes(storedWallet.address)) {
        cacheObj.addresses = `${cacheObj.addresses},${storedWallet.address}`;
      }

      if (!cacheObj.chains) {
        cacheObj.chains = storedWallet.network;
      } else if (!cacheObj.chains.includes(storedWallet.network)) {
        cacheObj.chains = `${cacheObj.chains},${storedWallet.network}`;
      }
    }

    // 3. Check which data is missing
    const hasAddresses = Boolean(cacheObj.addresses);
    const hasChains = Boolean(cacheObj.chains);

    // 4. If all data is available, present final info
    if (hasAddresses && hasChains) {
      const { evmAddresses, solanaAddresses } = categorizeAddresses(cacheObj.addresses!);

      return allDataCollectedTemplate({
        evmAddresses: evmAddresses.length ? evmAddresses.join(', ') : 'None',
        solanaAddresses: solanaAddresses.length ? solanaAddresses.join(', ') : 'None',
        chains: cacheObj.chains!
      }).trim();
    }

    // 5. Build partial summary
    let context: Record<string, string>;
    if (hasAddresses) {
      const { evmAddresses, solanaAddresses } = categorizeAddresses(cacheObj.addresses!);
      context = {
        evmAddresses: evmAddresses.length ? evmAddresses.join(', ') : 'None',
        solanaAddresses: solanaAddresses.length ? solanaAddresses.join(', ') : 'None',
        chains: cacheObj.chains ?? 'None'
      };
    } else {
      context = {
        evmAddresses: 'None',
        solanaAddresses: 'None',
        chains: cacheObj.chains ?? 'None'
      };
    }

    const partialSummary = summaryTemplate(context);

    // 6. Build instructions for missing info
    const missingParts: string[] = [];
    if (!hasAddresses) {
      missingParts.push(
        '- Ask the user to share their blockchain wallet addresses. The user may have multiple addresses across different chains.',
        '- If the user asks for a wallet to be created, then ommit the previous question.'
      );
    }
    if (!hasChains) {
      missingParts.push(
        '- Ask the user which blockchain networks they primarily interact with. Examples include Ethereum, BSC, Polygon, or Solana.',
        '- If the user asks for a wallet to be created, then ommit the previous question.'
      );
    }

    // 7. Return the compiled text with instructions header
    const instructions = missingParts.length > 0
      ? `\nInstructions for collecting missing data:\n${missingParts.join('\n')}`
      : '';

    return `${partialSummary.trim()}${instructions}`;
  },
};
