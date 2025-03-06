import { encodeFunctionData } from 'viem';

import {
  AAVE_POOL,
  GeneralMessage,
  getChainId,
  getTokenAddress,
  getTokenAmount
} from "./helpers";

export async function validateAndBuildYield(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromChain,
      fromToken,
      recipientAddress,
      description,
    }
  } = message;

  // Simple Aave supply
   if (!amount || !fromChain || !fromToken) {
    console.log('missing fields');
    return null;
  }

  const tokenAddr = getTokenAddress(fromChain, fromToken);
  const tokenAmount = getTokenAmount(amount, fromChain, fromToken);

  if (!tokenAddr || !tokenAmount) {
    throw new Error(`Invalid token address or amount for chain ${fromChain} and token ${fromToken}`);
  }

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

  const chainId = getChainId(fromChain);
  const aavePool = AAVE_POOL[chainId][fromToken];

  return {
    description: `Deposit ${fromToken} in Aave V3 on ${fromChain}${description ? ` (from previous instructions: "${description}")` : ''}`,
    titles: [
      'Approve', 'Supply'
    ],
    calls: [
      `Approve ${amount}${fromToken} to be deposited in AavePool`,
      `Supply ${amount}${fromToken} in AavePool. ${recipientAddress} will receive the a${fromToken} tokens`
    ],
    transactions: [
      { // approve
        chainId,
        to: tokenAddr,
        value: 0,
        data: encodeFunctionData({abi, functionName: "approve", args: [aavePool, tokenAmount]})
      },
      { // supply
        chainId,
        to: aavePool,
        value: 0,
        data: encodeFunctionData({abi, functionName: "supply", args: [tokenAddr, tokenAmount, recipientAddress, 0]})
      }
    ]
  }
}
