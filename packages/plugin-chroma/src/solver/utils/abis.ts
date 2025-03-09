export const APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ]
  }
];

export const AAVE_V3_SUPPLY_ABI = [
  {
    name: 'supply',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' }
    ]
  }
];

export const AAVE_V3_WITHDRAW_ABI = [
  {
    name: 'withdraw',
    type: 'function',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' }
    ]
  },
];

export const CURVE_ADD_LIQUIDITY_ABI = [
  {
    name: 'add_liquidity',
    type: 'function',
    inputs: [
      { name: 'token_amounts', type: 'uint256[]' },
      { name: 'min_mint_amount', type: 'uint256' }
    ]
  }
];

export const CURVE_REMOVE_LIQUIDITY_ONE_COIN_ABI = [
  {
    name: 'remove_liquidity_one_coin',
    type: 'function',
    inputs: [
      { name: 'burn_amount', type: 'uint256' },
      { name: 'coin_index', type: 'int128' },
      { name: 'min_amount', type: 'uint256' }
    ]
  }
];
