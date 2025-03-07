import { encodeFunctionData } from 'viem';

import { AAVE_V3_SUPPLY_ABI, APPROVE_ABI } from './utils/abis';
import {
  AAVE_POOL,
  GeneralMessage,
  getChainId,
  getTokenAddress,
  getTokenAmount
} from './helpers';

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
      {
        chainId,
        to: tokenAddr,
        value: 0,
        data: encodeFunctionData({abi: APPROVE_ABI, functionName: "approve", args: [aavePool, tokenAmount]})
      }, {
        chainId,
        to: aavePool,
        value: 0,
        data: encodeFunctionData({abi: AAVE_V3_SUPPLY_ABI, functionName: "supply", args: [tokenAddr, tokenAmount, recipientAddress, 0]})
      }
    ]
  }
}
