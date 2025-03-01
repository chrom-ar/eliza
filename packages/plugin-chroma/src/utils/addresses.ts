export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const TOKENS = {
  "ETHEREUM": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "aUSDC": "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c"
  },
  "BASE-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    "aUSDC": "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC"
  },
  "ARB-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    "aUSDC": "0x460b97BD498E1157530AEb3086301d5225b91216"
  },
  "OPT-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    "aUSDC": "0xa818F1B57c201E092C4A2017A91815034326Efd1"
  },
};

export const TOKEN_DECIMALS: Record<string, Record<string, number>> = {
  "ETHEREUM": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6
  },
  "BASE-SEPOLIA": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6
  },
  "ARB-SEPOLIA": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6
  },
  "OPT-SEPOLIA": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6
  },
};

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
};

export const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "balance",
        "type": "uint256"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "name": "",
        "type": "string"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];