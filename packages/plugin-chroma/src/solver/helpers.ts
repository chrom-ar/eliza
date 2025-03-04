import * as chains from 'viem/chains';

const networkAliases: Record<string, string> = {
  // Ethereum
  'eth': 'mainnet',
  'ethereum': 'mainnet',

  // Base
  'base': 'base',
  'base-sepolia': 'baseSepolia',

  // Arbitrum
  'arb': 'arbitrum',
  'arbitrum': 'arbitrum',
  'arb-sepolia': 'arbitrumSepolia',

  // Optimism
  'opt': 'optimism',
  'optimism': 'optimism',
  'opt-sepolia': 'optimismSepolia'
};

export interface GeneralMessage {
  timestamp: number;
  roomId: string;
  body: {
    amount: string;
    fromToken: string;
    toToken?: string; // Optional for bridge operations
    fromAddress: string;
    fromChain: string;
    recipientAddress: string;
    recipientChain: string;
    type: 'BRIDGE' | 'TRANSFER' | 'YIELD' | 'SWAP';
  };
}

type Token = "ETH" | "USDC" | "SOL";

export const ZERO_ADDRESS = '0x' + '0'.repeat(40);

export const TOKENS = {
  "ETHEREUM": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  },
  "SOLANA": {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  "BASE-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  },
  "ARB-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
  },
  "OPT-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x5fd84259d66cd46123540766be93dfe6d43130d7",
  },
}

export const TOKEN_DECIMALS: Record<string, Record<Token & undefined, number>> = {
  "ETHEREUM": {
    "ETH": 18,
    "USDC": 6
  },
  "SOLANA": {
    "SOL": 9,
    "USDC": 6
  },
  "BASE-SEPOLIA": {
    "ETH": 18,
    "USDC": 6
  },
  "ARB-SEPOLIA": {
    "ETH": 18,
    "USDC": 6
  },
  "OPT-SEPOLIA": {
    "ETH": 18,
    "USDC": 6
  },
}

// TMP just for simplicity
export const AAVE_POOL = {
  "ARB-SEPOLIA": {
    "USDC": "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff"
  },
  "BASE-SEPOLIA": {
    "USDC": "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b"
  },
  "OPT-SEPOLIA": {
    "USDC": "0xb50201558B00496A145fE76f7424749556E326D8"
  }
}

// TODO: remove sepolia
export const EVM_CHAINS = ["ETHEREUM", "SEPOLIA", "BASE", "BASE-SEPOLIA", "ARBITRUM", "ARB-SEPOLIA", "OPTIMISM", "OPT-SEPOLIA"];

export const AVAILABLE_TYPES = ["TRANSFER", "YIELD"];

export function isEvmChain(chain: string): boolean {
  return EVM_CHAINS.includes(chain.toUpperCase());
}

export const getChainId = (network: string) => {
  const normalizedNetwork = network.toLowerCase();
  const standardNetwork = networkAliases[normalizedNetwork] || normalizedNetwork;
  // Since our data came from a model, we need to check all possible combinations
  const chainId = (chains[standardNetwork] || chains[normalizedNetwork] || chains[network])?.id

  if (!chainId) {
    for (let k in chains) {
      // chains has to be "get" to obtain the network
      if (chains[k].network === standardNetwork) {
        return chains[k].id
      }
    }
  }

  return chainId
}
