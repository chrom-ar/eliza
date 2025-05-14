import * as chains from 'viem/chains';
import { parseUnits } from 'viem';

import { WakuMessage, BodyMessage } from '@chrom-ar/solver-sdk';

const networkAliases: Record<string, string> = {
  // Ethereum
  'eth': 'mainnet',
  'ethereum': 'mainnet',
  'eth-mainnet': 'mainnet',
  'ethereum mainnet': 'mainnet',
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

const ENVIRONMENTS: Record<string, 'Mainnet' | 'Testnet' | 'Devnet'> = {
  [chains.mainnet.id]: 'Mainnet',
  [chains.base.id]: 'Mainnet',
  [chains.arbitrum.id]: 'Mainnet',
  [chains.avalanche.id]: 'Mainnet',
  [chains.optimism.id]: 'Mainnet',
  [chains.sepolia.id]: 'Testnet',
  [chains.baseSepolia.id]: 'Testnet',
  [chains.arbitrumSepolia.id]: 'Testnet',
  [chains.optimismSepolia.id]: 'Testnet',
  [chains.avalancheFuji.id]: 'Testnet',
}

export interface GeneralMessage extends WakuMessage {
  body: Omit<BodyMessage, 'type'> & {
    type: 'BRIDGE' | 'TRANSFER' | 'YIELD' | 'SWAP' | 'CLAIM';
  };
}

type Token = "ETH" | "USDC" | "SOL";

export const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const CHAIN_NAMES = {
  [chains.mainnet.id]: "ethereum",
  [chains.base.id]: "base",
  [chains.arbitrum.id]: "arbitrum",
  [chains.avalanche.id]: "avalanche",
  [chains.optimism.id]: "optimism",
  [chains.sepolia.id]: "sepolia",
  [chains.baseSepolia.id]: "base-sepolia",
  [chains.arbitrumSepolia.id]: "arbitrum-sepolia",
  [chains.optimismSepolia.id]: "optimism-sepolia",
  [chains.avalancheFuji.id]: "avalanche-fuji",
}

const TOKENS = {
  // TODO: Add full Solana support
  // "SOLANA": {
  //   "SOL": "So11111111111111111111111111111111111111112",
  //   "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  // },
  [chains.mainnet.id]: {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "CRVUSDC": "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E", // Not quite, but it should work
  },
  [chains.base.id]: {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "USDT": "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // Check, not used on Aave
    "DAI": "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // Check, not used on Aave
    "CRVUSDC": "0xf6C5F01C7F3148891ad0e19DF78743D31E390D1f", // 4pool, but should work
  },
  [chains.arbitrum.id]: {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "CRVUSDC": "0xec090cf6DD891D2d014beA6edAda6e05E025D93d",
  },
  [chains.avalanche.id]: {
    "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    "USDT": "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    "DAI": "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
    "DAI.E": "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
  },
  [chains.optimism.id]: {
    "ETH": ZERO_ADDRESS,
    "OP": "0x4200000000000000000000000000000000000042",
    "USDC": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "USDT": "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    "DAI": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    "USDC.E": "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
    "CRVUSDC": "0x03771e24b7C9172d163Bf447490B142a15be3485", //crvUSD/USDC
  },
  [chains.sepolia.id]: {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  },
  [chains.baseSepolia.id]: {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  },
  [chains.arbitrumSepolia.id]: {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
  },
  [chains.optimismSepolia.id]: {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x5fd84259d66cd46123540766be93dfe6d43130d7",
  },
}

const TOKEN_DECIMALS: Record<string, Record<Token & undefined, number>> = {
  // TODO: Add full Solana support
  // "SOLANA": {
  //   "SOL": 9,
  //   "USDC": 6,
  // },
  [chains.mainnet.id]: {
    "ETH": 18,
    "USDC": 6,
    "CRVUSDC": 18,
  },
  [chains.base.id]: {
    "ETH": 18,
    "USDC": 6,
    "CRVUSDC": 18,
  },
  [chains.arbitrum.id]: {
    "ETH": 18,
    "USDC": 6,
    "CRVUSDC": 18,
  },
  [chains.avalanche.id]: {
    "USDC": 6,
    "USDT": 6,
    "DAI": 18,
  },
  [chains.optimism.id]: {
    "ETH": 18,
    "OP": 18,
    "USDC": 6,
    "USDT": 6,
    "DAI": 18,
    "USDC.E": 6,
    "CRVUSDC": 18,
  },
  [chains.sepolia.id]: {
    "ETH": 18,
    "USDC": 6,
  },
  [chains.baseSepolia.id]: {
    "ETH": 18,
    "USDC": 6,
  },
  [chains.arbitrumSepolia.id]: {
    "ETH": 18,
    "USDC": 6,
  },
  [chains.optimismSepolia.id]: {
    "ETH": 18,
    "USDC": 6,
  },
}

// TMP just for simplicity
export const AAVE_POOL = {
  [chains.mainnet.id]: {
    "USDC": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  },
  [chains.arbitrum.id]: {
    "USDC": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  },
  [chains.avalanche.id]: {
    "USDC": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    "USDT": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    "DAI": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  },
  [chains.base.id]: {
    "USDC": "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  },
  [chains.optimism.id]: {
    "USDC": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    "USDT": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    "DAI": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    "USDC.E": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  },
  [chains.sepolia.id]: {
    "USDC": "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  },
  [chains.arbitrumSepolia.id]: {
    "USDC": "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff",
  },
  [chains.baseSepolia.id]: {
    "USDC": "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
  },
  [chains.optimismSepolia.id]: {
    "USDC": "0xb50201558B00496A145fE76f7424749556E326D8",
  }
}

export const CURVE_POOLS = {
  [chains.mainnet.id]: {
    "USDC": {
      pool: "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E",
      index: 0,
      coins_count: 4,
    },
  },
  [chains.arbitrum.id]: {
    "USDC": {
      pool: "0xec090cf6DD891D2d014beA6edAda6e05E025D93d",
      index: 1,
      coins_count: 2,
    },
  },
  [chains.base.id]: {
    "USDC": {
      pool: "0xf6C5F01C7F3148891ad0e19DF78743D31E390D1f",
      index: 0,
      coins_count: 2,
    },
  },
  [chains.optimism.id]: {
    "USDC": {
      pool: "0x03771e24b7C9172d163Bf447490B142a15be3485",
      index: 1,
      coins_count: 2,
    },
  },
}


// TODO: remove sepolias
const EVM_CHAIN_IDS = [
  chains.mainnet.id,
  chains.base.id,
  chains.arbitrum.id,
  chains.avalanche.id,
  chains.optimism.id,
  chains.sepolia.id,
  chains.baseSepolia.id,
  chains.arbitrumSepolia.id,
  chains.optimismSepolia.id,
];

export function isEvmChain(chain: string): boolean {
  return EVM_CHAIN_IDS.includes(getChainId(chain));
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

export function getChainName(chain: string): string | null {
  const chainId = getChainId(chain);

  return CHAIN_NAMES[chainId] || null;
}

export function getEnvironment(chain: string): 'Mainnet' | 'Testnet' | 'Devnet' | null {
  const chainId = getChainId(chain);

  return ENVIRONMENTS[chainId] || null;
}

export function getTokenAddress(chain: string, token: string): string | null {
  const chainId = getChainId(chain);
  const normalizedToken = token.toUpperCase();

  if (!TOKENS[chainId]) {
    console.log(`Error: Chain ${chainId} not found in supported chains`);
    return null;
  }

  if (!TOKENS[chainId][normalizedToken]) {
    console.log(`Error: Token ${normalizedToken} not found for chain ${chainId} (${chain})`);
    return null;
  }

  return TOKENS[chainId][normalizedToken];
}

export function getTokenDecimals(chain: string, token: string): number | null {
  const chainId = getChainId(chain);
  const normalizedToken = token.toUpperCase();

  if (!TOKEN_DECIMALS[chainId]) {
    console.log(`Error: Chain ${chainId} not found in supported decimals`);
    return null;
  }

  if (TOKEN_DECIMALS[chainId][normalizedToken] === undefined) {
    console.log(`Error: Decimals for token ${normalizedToken} not found for chain ${chainId}`);
    return null;
  }

  return TOKEN_DECIMALS[chainId][normalizedToken];
}

export function getTokenAmount(amount: string, chain: string, token: string): string | null {
  const chainId = getChainId(chain);
  const normalizedToken = token.toUpperCase();
  const tokenDecimals = getTokenDecimals(chain, token);

  if (!tokenDecimals) {
    console.log(`Error: Token decimals for ${normalizedToken} not found for chain ${chainId}`);
    return null;
  }

  try {
    return parseUnits(amount, tokenDecimals).toString();
  } catch (error) {
    console.log(`Error parsing amount ${amount} for ${normalizedToken} on ${chainId}: ${error.message}`);
    return null;
  }
}
