import { createConfig, ChainKey, ChainId, getQuote } from '@lifi/sdk';
import { type Chain, parseEther } from 'viem';

// Types from your existing framework
import type { GeneralMessage } from './transactionHelpers';

interface EVMLiFiConfig {
  chains: Record<string, Chain>;
}

interface SwapBuilder {
  buildSwapTransaction(message: GeneralMessage): Promise<{transaction: any}>;
}

export class EVMLiFiSwap implements SwapBuilder {
  private config;

  constructor() {
    this.config = createConfig({
      integrator: "chroma",
    });
  }

  async buildSwapTransaction(message: GeneralMessage) {
    try {
      const {
        body: {
          amount,
          fromToken,
          toToken,
          fromAddress,
          fromChain,
        }
      } = message;

      const fromChainKey = convertToChainKey(fromChain);
      const fromChainId = ChainId[fromChainKey.toUpperCase()];

      const quote = await getQuote({
        fromChain: fromChainId,
        toChain: fromChainId, // Same chain swap
        fromToken: fromToken,
        toToken: toToken,
        fromAmount: parseEther(amount).toString(),
        fromAddress: fromAddress
      });

      const transactionRequest = quote.transactionRequest;

      return {
        transactions: [
          {
            ...transactionRequest,
            value: BigInt(transactionRequest.value).toString(),
            gasPrice: BigInt(transactionRequest.gasPrice).toString(),
            gasLimit: BigInt(transactionRequest.gasLimit).toString()
          }
        ]
      };

    } catch (error) {
      console.error("Error in buildSwapTransaction:", error);
      throw error;
    }
  }
}

export function convertToChainKey(chainName: string): ChainKey {
    const normalized = chainName.toLowerCase().trim();

    const chainKeyMappings: Record<string, string[]> = {
        // TODO: remove sepolia
        [ChainKey.ETH]: ['ethereum', 'eth', 'ether', 'mainnet', 'sepolia'],
        [ChainKey.POL]: ['polygon', 'matic', 'poly'],
        [ChainKey.ARB]: ['arbitrum', 'arb', 'arbitrum one'],
        [ChainKey.AVA]: ['avalanche', 'avax'],
        [ChainKey.BSC]: ['binance', 'bsc', 'bnb', 'binance smart chain'],
        [ChainKey.OPT]: ['optimism', 'op'],
        [ChainKey.BAS]: ['base'],
        [ChainKey.TER]: ['zksync', 'zksync era', 'era'],
        [ChainKey.FTM]: ['fantom', 'ftm'],
        [ChainKey.ONE]: ['harmony', 'one'],
        [ChainKey.CRO]: ['cronos', 'cro'],
        [ChainKey.AUR]: ['aurora'],
        [ChainKey.CEL]: ['celo']
    };

    for (const [chainKey, aliases] of Object.entries(chainKeyMappings)) {
        if (aliases.some(alias => normalized.includes(alias))) {
            return chainKey as ChainKey;
        }
    }

    return ChainKey.ETH; // Default to Ethereum if no match found
}