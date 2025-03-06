import { encodeFunctionData, parseUnits } from 'viem';

import {
  AAVE_POOL,
  GeneralMessage,
  getChainId,
  getTokenAddress,
  getTokenAmount
} from "./helpers";

export async function validateAndBuildWithdraw(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromChain,
      fromToken,
      fromAddress,
      description,
    }
  } = message;

  // Simple Aave withdraw
  if (!amount || !fromChain || !fromToken) {
    console.log('missing fields');
    return null;
  }

  const tokenAddr = getTokenAddress(fromChain, fromToken);
  const tokenAmount = getTokenAmount(amount, fromChain, fromToken);

  if (!tokenAddr || !tokenAmount) {
    throw new Error(`Invalid token address or amount for chain ${fromChain} and token ${fromToken}`);
  }

  // Encode withdraw transaction
  const abi = [
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

  const chainId = getChainId(fromChain);
  const aavePool = AAVE_POOL[chainId][fromToken];

  return {
    description: `Withdraw ${fromToken} from Aave V3 on ${fromChain}${description ? ` (from previous instructions: "${description}")` : ''}`,
    titles: [
      'Withdraw'
    ],
    calls: [
      `Withdraw ${amount}${fromToken} from AavePool. ${fromAddress} will receive the tokens`
    ],
    transactions: [
      { // withdraw
        chainId,
        to: aavePool,
        value: 0,
        data: encodeFunctionData({abi, functionName: "withdraw", args: [tokenAddr, tokenAmount, fromAddress]})
      }
    ]
  };
}
