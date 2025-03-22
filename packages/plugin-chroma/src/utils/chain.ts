import * as chains from 'viem/chains';

const networkAliases: Record<string, string> = {
  // Ethereum
  'eth': 'mainnet',
  'ethereum': 'mainnet',
  'eth-mainnet': 'mainnet',
  'eth-sepolia': 'sepolia',

  // Base
  'base': 'base',
  'base-mainnet': 'base',
  'base-ethereum': 'base',
  'base-sepolia': 'baseSepolia',

  // Arbitrum
  'arb': 'arbitrum',
  'arbitrum': 'arbitrum',
  'arb-mainnet': 'arbitrum',
  'arb-ethereum': 'arbitrum',
  'arb-sepolia': 'arbitrumSepolia',

  // Avalanche
  'avax': 'avalanche',
  'avalanche': 'avalanche',
  'avax-mainnet': 'avalanche',
  'avax-ethereum': 'avalanche',
  'avax-sepolia': 'avalancheFuji',
  'avax-fuji': 'avalancheFuji',

  // Optimism
  'opt': 'optimism',
  'optimism': 'optimism',
  'opt-mainnet': 'optimism',
  'opt-ethereum': 'optimism',
  'opt-sepolia': 'optimismSepolia'
};

const ALCHEMY_CHAIN_NAMES = {
  [chains.mainnet.id]: "eth-mainnet",
  [chains.base.id]: "base-mainnet",
  [chains.arbitrum.id]: "arb-mainnet",
  [chains.avalanche.id]: "avax-mainnet",
  [chains.optimism.id]: "opt-mainnet",
  [chains.sepolia.id]: "eth-sepolia",
  [chains.baseSepolia.id]: "base-sepolia",
  [chains.arbitrumSepolia.id]: "arb-sepolia",
  [chains.optimismSepolia.id]: "opt-sepolia",
  [chains.avalancheFuji.id]: "avax-fuji",
}

export const getChainId = (network: string) => {
  if (network.toUpperCase() === "SOLANA") {
    return "SOLANA";
  }

  const normalizedNetwork = network.toLowerCase();
  const standardNetwork = networkAliases[normalizedNetwork] || normalizedNetwork;
  // Since our data mostly came from a model, we need to check all possible combinations
  const chainId = (chains[standardNetwork] || chains[normalizedNetwork] || chains[network])?.id

  if (!chainId) {
    for (let k in chains) {
      // chains has to be "get" to obtain the network
      if (chains[k].network === standardNetwork) {
        return chains[k].id
      }
    }

    console.log(`Error: Chain ${network} not found in supported chains`);
    return null;
  }

  return chainId
}

export function getAlchemyChainName(chain: string): string | null {
  const chainId = getChainId(chain);

  return ALCHEMY_CHAIN_NAMES[chainId] || null;
}
