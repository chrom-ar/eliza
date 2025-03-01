import { encodeFunctionData, parseUnits } from 'viem';

import {
  AAVE_POOL,
  GeneralMessage,
  TOKENS,
  TOKEN_DECIMALS,
  getChainId,
} from "./helpers";

export async function validateAndBuildWithdraw(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromChain,
      fromToken,
      fromAddress,
    }
  } = message;

  // Simple Aave withdraw
  if (!amount || !fromChain || !fromToken) {
    console.log('missing fields');
    return null;
  }

  fromChain = fromChain.toUpperCase();
  fromToken = fromToken.toUpperCase();

  const tokenAddr = TOKENS[fromChain][fromToken];
  const tokenAmount = parseUnits(amount, TOKEN_DECIMALS[fromChain][fromToken]).toString();

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

  const aavePool = AAVE_POOL[fromChain][fromToken];
  const chainId = getChainId(fromChain);

  return {
    description: `Withdraw ${fromToken} from Aave V3 on ${fromChain}`,
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
