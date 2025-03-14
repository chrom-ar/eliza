export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const TOKENS = {
  "ETH-MAINNET": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "aUSDC": "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
    "crvUSDC": "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E", // Not quite, but it should work
  },
  "BASE-MAINNET": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "aUSDC": "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    "crvUSDC": "0xf6C5F01C7F3148891ad0e19DF78743D31E390D1f", // 4pool, but should work
  },
  "ARB-MAINNET": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "aUSDC": "0x724dc807b04555b71ed48a6896b6F41593b8C637",
    "crvUSDC": "0xec090cf6DD891D2d014beA6edAda6e05E025D93d",
  },
  "OPT-MAINNET": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "USDT": "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    "DAI": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    "aUSDC": "0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5",
    "aUSDT": "0x6ab707Aca953eDAeFBc4fD23bA73294241490620",
    "aDAI": "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE",
    "crvUSDC": "0x03771e24b7C9172d163Bf447490B142a15be3485", //crvUSD/USDC
  },
  "BASE-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    "aUSDC": "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",
  },
  "ARB-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    "aUSDC": "0x460b97BD498E1157530AEb3086301d5225b91216",
  },
  "OPT-SEPOLIA": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    "aUSDC": "0xa818F1B57c201E092C4A2017A91815034326Efd1",
  },
};

export const TOKEN_DECIMALS: Record<string, Record<string, number>> = {
  "ETH-MAINNET": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6,
    "crvUSDC": 18,
  },
  "BASE-MAINNET": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6,
    "crvUSDC": 18,
  },
  "ARB-MAINNET": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6,
    "crvUSDC": 18,
  },
  "OPT-MAINNET": {
    "ETH": 18,
    "USDC": 6,
    "USDT": 6,
    "DAI": 18,
    "aUSDC": 6,
    "aUSDT": 6,
    "aDAI": 18,
    "crvUSDC": 18,
  },
  "BASE-SEPOLIA": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6,
  },
  "ARB-SEPOLIA": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6,
  },
  "OPT-SEPOLIA": {
    "ETH": 18,
    "USDC": 6,
    "aUSDC": 6,
  },
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