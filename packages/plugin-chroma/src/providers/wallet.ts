import { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import * as path from 'path';

/**
 * This template is an example.
 * We embed placeholders for address and chains,
 * so the code can fill them in at runtime.
 */
const summaryTemplate = `
We have the following user wallet data so far:
- Address: {{address}}
- Preferred chains: {{chains}}
`;

/**
 * The final message if all data is collected:
 * 'We have all your wallet data. Here\'s the full info: ...'
 */
const allDataCollectedTemplate = `
Great news! We have *all* your wallet data. Here's the summary:

Address: {{address}}
Preferred chains: {{chains}}

Next Steps:
- We can proceed to your next request, or
- If you have more wallet accounts, let me know.
`;

export const walletProvider: Provider = {
  /**
   * Provide context about the user's current wallet data,
   * including instructions if data is missing.
   */
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // 1. Build the cache key ( agentId / userId / data )
    const cacheKey = path.join(runtime.agentId, message.userId, 'data');

    // 2. Fetch from cache
    //    We'll store an object that has shape:
    //    { address: string | undefined, chains: string[] | undefined }
    let cacheObj = await runtime.cacheManager.get<{
      address?: string;
      chains?: string[];
    }>(cacheKey);

    // 3. If there's no existing data, initialize it with `undefined` fields
    if (!cacheObj) {
      cacheObj = { address: undefined, chains: undefined };
      // Immediately store this so it persists for next usage
      await runtime.cacheManager.set(cacheKey, cacheObj);
    }

    // 4. Check which data is missing
    const hasAddress = Boolean(cacheObj.address);
    const hasChains = Boolean(cacheObj.chains && cacheObj.chains.length > 0);

    // 5. If all data is available, present final info
    if (hasAddress && hasChains) {
      const finalText = allDataCollectedTemplate
        .replace('{{address}}', cacheObj.address!)
        .replace('{{chains}}', cacheObj.chains!.join(', '));

      // We can return a JSON object if needed, or just a string.
      // Since your code typically returns text context, we’ll do so here.
      return finalText.trim();
    }

    // 6. Build partial summary
    const partialSummary = summaryTemplate
      .replace('{{address}}', cacheObj.address ?? '<undefined>')
      .replace('{{chains}}', (cacheObj.chains ?? ['<undefined>']).join(', '));

    // 7. Build instructions for missing info
    const missingParts: string[] = [];
    if (!hasAddress) {
      missingParts.push('Address is missing. Please provide your wallet address.');
    }
    if (!hasChains) {
      missingParts.push(
        'Preferred chains are missing. Please list the chains you primarily use (e.g. Ethereum, BSC, Polygon).'
      );
    }

    // 8. Return the compiled text:
    //    partial summary + instructions
    //    You can also shape it as JSON if your system needs that.
    //    For clarity, we’ll keep it as a friendly text message.
    const instructions = missingParts.join('\n');

    return `${partialSummary.trim()}

${instructions}`;
  },
};
