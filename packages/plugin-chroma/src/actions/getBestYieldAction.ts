import { Action, Memory, IAgentRuntime, HandlerCallback, State, elizaLogger, ModelClass, composeContext, generateObject } from '@elizaos/core';
import { z } from 'zod';
import { getDefaultWallet } from '../utils/walletData';
import { fetchAaveYieldData } from '../utils/aave';

// Define the schema for yield comparison options
const bestYieldSchema = z.object({
  networks: z.array(z.string()).default(['arb-sepolia', 'opt-sepolia']),
  asset: z.string().default('USDC'),
});

const contextTemplate = `# User Message
{{message}}

# Available Networks
The available networks are: arb-sepolia, opt-sepolia

Follow the instructions:
1. Extract any specific networks the user is asking about from their message
2. If the user doesn't specify networks, return both arb-sepolia and opt-sepolia
3. Always select at least two networks for comparison (a yield comparison needs at least 2 networks)
4. If the user only mentions one network, include at least one other network for comparison
5. IMPORTANT: The networks must be from this list: arb-sepolia, opt-sepolia`;

export const getBestYieldAction: Action = {
  suppressInitialMessage: true,
  name: 'GET_BEST_YIELD',
  similes: ['COMPARE_YIELDS', 'BEST_YIELD_RATES'],
  description: 'Compares AAVE yield rates across networks to find the best yield',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    return text.includes('best yield') ||
      text.includes('compare yield') ||
      text.includes('highest yield') ||
      text.includes('best interest') ||
      (text.includes('yield') && text.includes('better')) ||
      (text.includes('aave') && text.includes('rate'));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State | undefined, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    // Default options
    let options: z.infer<typeof bestYieldSchema> = {
      networks: ['arb-sepolia', 'opt-sepolia'],
      asset: 'USDC'
    };

    // Use generateObject to extract networks mentioned in the message
    const context = composeContext({
      state,
      template: contextTemplate,
      // @ts-ignore - The composeContext type definition doesn't include message, but it works
      message: message.content.text
    });

    try {
      const result = (await generateObject({
        runtime,
        modelClass: ModelClass.SMALL,
        schema: bestYieldSchema,
        schemaName: 'NetworkSelection',
        context
      })).object as z.infer<typeof bestYieldSchema>;

      if (result && Array.isArray(result.networks) && result.networks.length >= 2) {
        options.networks = result.networks;
      } else if (result && Array.isArray(result.networks) && result.networks.length === 1) {
        // If only one network was extracted, add the other for comparison
        const singleNetwork = result.networks[0];
        options.networks = [singleNetwork];

        // Add the other network that wasn't mentioned
        if (singleNetwork === 'arb-sepolia') {
          options.networks.push('opt-sepolia');
        } else {
          options.networks.push('arb-sepolia');
        }
      }

      // Extract asset mention if present (future enhancement)
      // Currently only supporting USDC
    } catch (error) {
      elizaLogger.error('Error parsing networks from message:', error);
      // Fallback to default networks on error
    }

    const userWallet = await getDefaultWallet(runtime, message.userId);
    const userAddress = userWallet?.address;

    try {
      // Fetch yield data for each network
      const yieldResults = await Promise.all(
        options.networks.map(async (network) => {
          try {
            const data = await fetchAaveYieldData(network, options.asset as any, userAddress);
            elizaLogger.debug(`Successfully fetched yield data for ${network}`);
            return { network, data };
          } catch (error) {
            elizaLogger.error(`Error fetching yield data for ${network}:`, error);
            return { network, data: [], error: (error as Error).message };
          }
        })
      );

      elizaLogger.debug('yieldResults', JSON.stringify(yieldResults.map(r => ({
        network: r.network,
        hasData: r.data.length > 0,
        error: r.error
      }))));

      // Filter out networks with errors
      const validResults = yieldResults.filter(result => result.data.length > 0);

      elizaLogger.debug('validResults', JSON.stringify(validResults.map(r => ({
        network: r.network,
        dataLength: r.data.length
      }))));

      if (validResults.length === 0) {
        await callback({ text: 'I couldn\'t fetch yield data from any of the specified networks. Please try again later.' });
        return true;
      }

      // Always show at least two networks for comparison if available
      // Never filter results to a single network as comparison requires at least two networks
      const finalResults = validResults;

      let bestYield = finalResults[0];
      let bestRate = finalResults[0].data[0]?.supplyAPY || 0;

      for (const result of finalResults) {
        const currentRate = result.data[0]?.supplyAPY || 0;

        if (currentRate > bestRate) {
          bestRate = currentRate;
          bestYield = result;
        }
      }

      let responseText = `I've checked the AAVE yield rates for ${options.asset} across ${finalResults.length} networks:\n\n`;

      for (const result of finalResults) {
        const rate = result.data[0]?.supplyAPY || 0;
        const isBest = result.network === bestYield.network;
        const formattedRate = (rate * 100).toFixed(2);

        responseText += `${result.network}: ${formattedRate}% ${isBest ? '(Best Rate) 🌟' : ''}\n`;

        // Safely check for user balance using try/catch to handle potential BigInt errors
        try {
          if (userAddress &&
              result.data[0]?.userScaledATokenBalance &&
              result.data[0].userScaledATokenBalance > BigInt(0)) {
            responseText += `  - You currently have funds deposited here\n`;
          }
        } catch (error) {
          elizaLogger.error(`Error checking user balance for ${result.network}:`, error);
        }
      }

      if (userAddress) {
        // Add recommendation if user has funds but not in the best network
        try {
          const userNetworks = finalResults.filter(result => {
            try {
              return result.data[0]?.userScaledATokenBalance &&
                     result.data[0].userScaledATokenBalance > BigInt(0);
            } catch (error) {
              elizaLogger.error(`Error filtering userNetworks for ${result.network}:`, error);
              return false;
            }
          });

          if (userNetworks.length === 0) {
            responseText += `\nYou don't currently have any funds deposited in AAVE. ${bestYield.network} offers the best rate if you're considering depositing.`;
          } else {
            // Check if user has funds in any non-optimal networks
            const nonOptimalNetworks = userNetworks.filter(network => network.network !== bestYield.network);

            if (nonOptimalNetworks.length > 0) {
              // User has funds in both optimal and non-optimal networks
              const hasOptimalFunds = userNetworks.some(network => network.network === bestYield.network);
              const nonOptimalNetworkNames = nonOptimalNetworks.map(n => n.network).join(', ');

              if (hasOptimalFunds) {
                responseText += `\nYou have funds in ${bestYield.network} with the best yield rate, but you also have funds in ${nonOptimalNetworkNames} with lower rates. Consider moving all your funds to ${bestYield.network} for maximum yield.`;
              } else {
                responseText += `\nYou currently have funds in ${nonOptimalNetworkNames}, but ${bestYield.network} offers a better rate. You might want to consider moving your funds for a better yield.`;
              }
            } else {
              // All user funds are in the optimal network
              responseText += `\nGreat! You already have all your funds in ${bestYield.network}, the network with the best yield rate.`;
            }
          }
        } catch (error) {
          elizaLogger.error('Error processing user networks:', error);
          responseText += `\nFor the best yield, I recommend using ${bestYield.network} with a rate of ${(bestYield.data[0]?.supplyAPY * 100).toFixed(2)}%.`;
        }
      } else {
        responseText += `\nFor the best yield, I recommend using ${bestYield.network} with a rate of ${(bestYield.data[0]?.supplyAPY * 100).toFixed(2)}%.`;
      }

      await callback({ text: responseText });
      return true;
    } catch (error) {
      elizaLogger.error('Error in getBestYieldAction:', error);
      await callback({ text: `I encountered an error while comparing yield rates: ${(error as Error).message}` });
      return false;
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Which network has the best yield for USDC?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Let me check the current AAVE yield rates for you...',
          action: 'GET_BEST_YIELD'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Am I getting the best yield on my deposits?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I\'ll compare yield rates across networks to see if you have the best possible yield.',
          action: 'GET_BEST_YIELD'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Compare AAVE yields between arb-sepolia and opt-sepolia' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Checking AAVE yield rates across those networks...',
          action: 'GET_BEST_YIELD'
        }
      }
    ]
  ]
};
