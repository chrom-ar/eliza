import { createConfig, executeRoute, getRoutes, CoinKey, ChainKey, type ChainType, getQuote } from '@lifi/sdk';
import { type Chain, parseEther } from 'viem';

// Types from your existing framework
import type { GeneralMessage } from '../solver/transaction_helpers';

interface EVMLiFiConfig {
  chains: Record<string, Chain>;
}

interface SwapBuilder {
  buildSwapTransaction(message: GeneralMessage): Promise<{transaction: any}>;
}

export class EVMLiFiSwap implements SwapBuilder {
  private config;

  constructor(private evmConfig: EVMLiFiConfig) {
    // Create LiFi config from provided EVM chains
    const chains = Object.values(evmConfig.chains).map(chain => {
      const nativeCurrencySymbol = chain.nativeCurrency.symbol.toUpperCase();

      // Validate that the symbol is a valid CoinKey
      if (!Object.values(CoinKey).includes(nativeCurrencySymbol as CoinKey)) {
        throw new Error(`Invalid native currency symbol: ${chain.nativeCurrency.symbol}. Must be one of: ${Object.values(CoinKey).join(', ')}`);
      }

      return {
        id: chain.id,
        name: chain.name,
        key: convertToChainKey(chain.name),
        chainType: "EVM" as ChainType,
        nativeToken: {
          ...chain.nativeCurrency,
          chainId: chain.id,
          address: "0x0000000000000000000000000000000000000000",
          coinKey: nativeCurrencySymbol as CoinKey,
          priceUSD: "0",
          logoURI: "",
        },
        metamask: {
          chainId: `0x${chain.id.toString(16)}`,
          chainName: convertToChainKey(chain.name),
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpcUrls.default.http[0]],
          blockExplorerUrls: [chain.blockExplorers?.default?.url],
        },
        rpcUrls: {
          public: { http: [chain.rpcUrls.default.http[0]] },
        },
        blockExplorerUrls: [chain.blockExplorers?.default?.url],
        coin: chain.nativeCurrency.symbol.toLowerCase() as CoinKey,
        mainnet: true,
        diamondAddress: "0x0000000000000000000000000000000000000000",
      };
    });

    this.config = createConfig({
      integrator: "chroma",
      chains,
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

      const chain = this.evmConfig.chains[fromChain.toLowerCase()];

      if (!chain) {
        throw new Error(`Chain ${fromChain} not supported`);
      }

      const quote = await getQuote({
        fromChain: chain.id,
        toChain: chain.id, // Same chain swap
        fromToken: fromToken,
        toToken: toToken,
        fromAmount: parseEther(amount).toString(),
        fromAddress: fromAddress
      });

      const transactionRequest = quote.transactionRequest;

      return {
        transaction: {
          ...transactionRequest,
          value: BigInt(transactionRequest.value).toString(),
          gasPrice: BigInt(transactionRequest.gasPrice).toString(),
          gasLimit: BigInt(transactionRequest.gasLimit).toString()
        }
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
}