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
      address?: string;
      chains?: string;
    }>(cacheKey);

    if (!dataInCache) {
      // This call should be made by the framework, but for some reason it's not working
      // So we're calling it manually here
      await walletEvaluator.handler(runtime, message);
      return true;
    }

    const hasAddress = Boolean(dataInCache.address);
    const hasChains = Boolean(dataInCache.chains);

    if (hasAddress && hasChains) {
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
      address?: string;
      chains?: string;
    }>(cacheKey);

    if (!cached) {
      cached = { address: undefined, chains: undefined };
    }

    // 3. Define schema for wallet data extraction
    const walletSchema = z.object({
      address: z.string().nullable(),
      chains: z.string().nullable()
    });

    const prompt = `
    Extract wallet address and preferred chains from this message, if any.

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
    if (extractedData.address && !cached.address) {
      cached.address = extractedData.address;
    }

    if (extractedData.chains && !cached.chains) {
      cached.chains = extractedData.chains;
    }

    // 6. Update the cache
    await runtime.cacheManager.set(cacheKey, cached);

    // 7. Return result
    const resultObj = {
      success: true,
      data: {
        address: cached.address ?? undefined,
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
      outcome: '{"success":true,"data":{"address":"0xABc1234","chains":"Ethereum,BSC"},"message":"Updated wallet info in cache"}',
    }
  ]
};
