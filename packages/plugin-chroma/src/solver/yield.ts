import { encodeFunctionData, parseUnits } from 'viem';

import {
  AAVE_POOL,
  GeneralMessage,
  TOKENS,
  TOKEN_DECIMALS,
} from "./helpers";

export async function validateAndBuildYield(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromChain,
      fromToken,
      recipientAddress,
    }
  } = message;

  // Simple Aave supply
   if (!amount || !fromChain || !fromToken) {
    console.log('missing fields');
    return null;
  }

  fromChain = fromChain.toUpperCase();
  fromToken = fromToken.toUpperCase();

  const tokenAddr   = TOKENS[fromChain][fromToken];
  const tokenAmount = parseUnits(amount, TOKEN_DECIMALS[fromChain][fromToken]).toString();

  // Aave v3 contract addresses for Base Sepolia
  // Encode supply transaction
  const abi = [
    {
      name: 'approve',
      type: 'function',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ]
    },
    {
      name: 'supply',
      type: 'function',
      inputs: [
        { name: 'asset', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'onBehalfOf', type: 'address' },
        { name: 'referralCode', type: 'uint16' }
      ]
    },
  ]

  const aavePool = AAVE_POOL[fromChain][fromToken];

  return {
    description: `Deposit ${fromToken} in Aave V3 on ${fromChain}`,
    titles: [
      'Approve', 'Supply'
    ],
    calls: [
      `Approve ${amount}${fromToken} to be deposited in AavePool`,
      `Supply ${amount}${fromToken} in AavePool. ${recipientAddress} will receive the a${fromToken} tokens`
    ],
    transactions: [
      { // approve
        to: tokenAddr,
        value: 0,
        data: encodeFunctionData({abi, functionName: "approve", args: [aavePool, tokenAmount]})
      },
      { // supply
        to: aavePool,
        value: 0,
        data: encodeFunctionData({abi, functionName: "supply", args: [tokenAddr, tokenAmount, recipientAddress, 0]})
      }
    ]
  }
}
