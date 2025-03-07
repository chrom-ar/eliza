import { encodeFunctionData } from 'viem';

import { AAVE_V3_WITHDRAW_ABI } from './utils/abis';
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
      {
        chainId,
        to: aavePool,
        value: 0,
        data: encodeFunctionData({abi: AAVE_V3_WITHDRAW_ABI, functionName: "withdraw", args: [tokenAddr, tokenAmount, fromAddress]})
      }
    ]
  };
}
