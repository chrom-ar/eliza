import * as chains from 'viem/chains';

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

}

export const TOKEN_DECIMALS = {
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

}

// TMP just for simplicity
export const AAVE_POOL = {
  "BASE-SEPOLIA": {
    "USDC": "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b"
  },
}


// TODO: remove sepolia
export const EVM_CHAINS = ["ETHEREUM", "SEPOLIA", "BASE", "BASE-SEPOLIA"];

export const AVAILABLE_TYPES = ["TRANSFER", "YIELD"];

export function isEvmChain(chain: string): boolean {
  return EVM_CHAINS.includes(chain.toUpperCase());
}

export const getChainId = (network: string) => {
  network = network.toLowerCase();

  let chainId = chains[network]?.id

  if (!chainId) {
    for (let k in chains) {
      // chains has to be "get" to obtain the network
      if (chains[k].network === network) {
        return chains[k].id
      }
    }
  }

  return chainId
}
