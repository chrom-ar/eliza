import { BodyMessage, WakuMessage } from '@chrom-ar/solver-sdk';
import * as chains from 'viem/chains';

export interface GeneralMessage extends WakuMessage {
  body: Omit<BodyMessage, 'type'> & {
    type: 'BRIDGE' | 'TRANSFER' | 'YIELD' | 'SWAP' | 'CLAIM';
  };
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

}
