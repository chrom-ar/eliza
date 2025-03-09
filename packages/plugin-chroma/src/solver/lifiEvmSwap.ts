import { encodeFunctionData } from 'viem';
import { getQuote } from '@lifi/sdk';

import { getChainId, getTokenAmount, GeneralMessage, getTokenAddress } from './helpers';
import { APPROVE_ABI } from './utils/abis';

export const buildSwapTransaction = async (message: GeneralMessage) => {
  try {
    const {
      body: {
        amount,
        fromToken,
        toToken,
        fromAddress,
        fromChain,
      }
    } = message;

    const fromChainId = getChainId(fromChain);
    const fromTokenAmount = getTokenAmount(amount, fromChain, fromToken);

    const quote = await getQuote({
      fromChain: fromChainId,
      toChain: fromChainId, // Same chain swap
      fromToken: fromToken,
      toToken: toToken,
      fromAmount: fromTokenAmount,
      fromAddress: fromAddress
    });

    const transactionRequest = quote.transactionRequest;

    return {
      transactions: [
        {
          chainId: fromChainId,
          to: getTokenAddress(fromChain, fromToken),
          value: 0,
          data: encodeFunctionData({abi: APPROVE_ABI, functionName: "approve", args: [transactionRequest.to, fromTokenAmount]})
        },
        {
          ...transactionRequest,
          value: BigInt(transactionRequest.value).toString(),
          gasPrice: BigInt(transactionRequest.gasPrice).toString(),
          gasLimit: BigInt(transactionRequest.gasLimit).toString()
        }
      ]
    };

  } catch (error) {
    console.error("Error in buildSwapTransaction:", error);
    throw error;
  }
}
