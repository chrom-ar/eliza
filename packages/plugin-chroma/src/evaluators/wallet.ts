import { Evaluator, IAgentRuntime, Memory, ModelClass } from '@elizaos/core';
import { generateObject } from '@elizaos/core';
import { z } from 'zod';
import * as path from 'path';

/**
 * An evaluator that tries to parse a user's message for wallet data
 * and store it in the cache.
 */
export const walletEvaluator: Evaluator = {
  name: 'GET_WALLET_DATA',
  similes: ['EXTRACT_WALLET_DATA'],
  description: 'Collect wallet address and chains from the user, storing in cache',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const cacheKey = path.join(runtime.agentId, message.userId, 'blockchain-data');
    const dataInCache = await runtime.cacheManager.get<{
      addresses?: string;
      chains?: string;
    }>(cacheKey);

    if (!dataInCache) {
      // This call should be made by the framework, but for some reason it's not working
      // So we're calling it manually here
      await walletEvaluator.handler(runtime, message);
      return true;
    }

    const hasAddresses = Boolean(dataInCache.addresses);
    const hasChains = Boolean(dataInCache.chains);

    if (hasAddresses && hasChains) {
      return false;
    }

    // Again, this call should be made by the framework, but for some reason it's not working
    // So we're calling it manually here
    await walletEvaluator.handler(runtime, message);
    return true;
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    // 1. Build cache key
    const cacheKey = path.join(runtime.agentId, message.userId, 'blockchain-data');

    // 2. Retrieve old data
    let cached = await runtime.cacheManager.get<{
      addresses?: string;
      chains?: string;
    }>(cacheKey);

    if (!cached) {
      cached = { addresses: undefined, chains: undefined };
    }

    // 3. Define schema for wallet data extraction
    const walletSchema = z.object({
      addresses: z.string().nullable(),
      chains: z.string().nullable()
    });

    const prompt = `
    Extract wallet address and preferred chains from this message, if any.
    Return null if no addresses or chains are found.

    - If the user presents more than one address, return them as one string, comma-separated values.
    - If the user presents more than one chain, return them as one string, comma-separated values.
    - For addresses, include both EVM (0x...) and Solana addresses.
    - If there is a Solana address (no 0x starting), include then Solana chain, even if no explicit chain is mentioned.
    - Do not return any other text, actions or comments.
    - Do not return arrays or objects, just strings.

    User message:
    \`\`\`
    ${message.content.text}
    \`\`\`
    `;

    // 4. Extract wallet info using AI
    const extractedData = (await generateObject({
      runtime,
      modelClass: ModelClass.MEDIUM,
      schema: walletSchema,
      context: prompt
    })).object as z.infer<typeof walletSchema>;

    // 5. Update cache with new data if found
    if (extractedData.addresses) {
      cached.addresses = extractedData.addresses;
    }

    if (extractedData.chains) {
      cached.chains = extractedData.chains;
    }

    // 6. Update the cache
    await runtime.cacheManager.set(cacheKey, cached);

    // 7. Return result
    const resultObj = {
      success: true,
      data: {
        addresses: cached.addresses ?? undefined,
        chains: cached.chains ?? undefined,
      },
      message: 'Updated wallet info in cache',
    };

    return JSON.stringify(resultObj);
  },

  examples: [
    {
      context: 'User wants to share wallet data quickly',
      messages: [
        {
          user: 'Alice',
          content: {
            text: 'My address is 0xABc1234 and the chains: Ethereum, BSC',
          },
        },
      ],
      outcome: '{"success":true,"data":{"addresses":"0xABc1234","chains":"Ethereum,BSC"},"message":"Updated wallet info in cache"}',
    },
    {
      context: 'User wants to share wallet data quickly',
      messages: [
        {
          user: 'Alice',
          content: {
            text: 'My address is 0xABc1234 and the chains: Polygon and yjAgent123 in Solana',
          },
        },
      ],
      outcome: '{"success":true,"data":{"addresses":"0xABc1234,yjAgent123","chains":"Polygon,Solana"},"message":"Updated wallet info in cache"}',
    },
  ],
};
