import { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import * as path from 'path';
import Handlebars from 'handlebars';

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
- Solana addresses: {{solanaAddresses}}
- Preferred chains: {{chains}}

Use this when you need to know the user's wallet data and no other context is needed.`);

/**
 * Separates addresses into EVM and Solana addresses
 */
function categorizeAddresses(addresses: string): { evmAddresses: string[], solanaAddresses: string[] } {
  const addressList = addresses.split(',').map(addr => addr.trim());
  return {
    evmAddresses: addressList.filter(addr => addr.toLowerCase().startsWith('0x')),
    solanaAddresses: addressList.filter(addr => !addr.toLowerCase().startsWith('0x'))
  };
}

export const walletProvider: Provider = {
  /**
   * Provide context about the user's current wallet data,
   * including instructions if data is missing.
   */
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // 1. Build the cache key ( agentId / userId / data )
    const cacheKey = path.join(runtime.agentId, message.userId, 'blockchain-data');

    // 2. Fetch from cache
    //    We'll store an object that has shape:
    //    { address: string | undefined, chains: string[] | undefined }
    let cacheObj = await runtime.cacheManager.get<{
      addresses?: string;
      chains?: string;
    }>(cacheKey);

    // 3. If there's no existing data, initialize it
    if (!cacheObj) {
      cacheObj = { addresses: undefined, chains: undefined };
      await runtime.cacheManager.set(cacheKey, cacheObj);
    }

    // 4. Check which data is missing
    const hasAddresses = Boolean(cacheObj.addresses);
    const hasChains = Boolean(cacheObj.chains);

    // 5. If all data is available, present final info
    if (hasAddresses && hasChains) {
      const { evmAddresses, solanaAddresses } = categorizeAddresses(cacheObj.addresses!);

      return allDataCollectedTemplate({
        evmAddresses: evmAddresses.length ? evmAddresses.join(', ') : 'None',
        solanaAddresses: solanaAddresses.length ? solanaAddresses.join(', ') : 'None',
        chains: cacheObj.chains!
      }).trim();
    }

    // 6. Build partial summary
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

    // 7. Build instructions for missing info
    const missingParts: string[] = [];
    if (!hasAddresses) {
      missingParts.push(
        '- Ask the user to share their blockchain wallet addresses. The user may have multiple addresses across different chains.'
      );
    }
    if (!hasChains) {
      missingParts.push(
        '- Ask the user which blockchain networks they primarily interact with. Examples include Ethereum, BSC, Polygon, or Solana.'
      );
    }

    // 8. Return the compiled text with instructions header
    const instructions = missingParts.length > 0
      ? `\nInstructions for collecting missing data:\n${missingParts.join('\n')}`
      : '';

    return `${partialSummary.trim()}${instructions}`;
  },
};
