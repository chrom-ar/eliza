import {
  GeneralMessage,
  isEvmChain,
} from "./helpers";

// import { swapToken as swapTokenSolJup } from './solJupiterSwap';
import { buildSwapTransaction } from './lifiEvmSwap';


export async function validateAndBuildSwap(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromToken,
      toToken,
      fromAddress,
      fromChain,
    }
  } = message;

  if (!amount || !fromToken || !toToken || !fromAddress || !fromChain) {
    console.log('missing swap fields', { amount, fromToken, toToken, fromAddress, fromChain });
    return null;
  }

  const swapResult = await _buildSwap(message);

  return {
    description: `Swap`,
    titles: [
      'Swap'
    ],
    calls: [
      `Swap ${amount}${fromToken} to ${toToken}`
    ],
    ...swapResult
  };
}

async function _buildSwap(message: GeneralMessage): Promise<object> {
  const {
    body: {
      fromChain,
    }
  } = message;

  if (isEvmChain(fromChain)) {
    return buildSwapTransaction(message);
  // TODO: Add full Solana support
  // } else if (fromChain.toUpperCase() === "SOLANA") {
  //   const {
  //     body: {
  //       amount,
  //       fromToken,
  //       toToken,
  //       fromAddress,
  //     }
  //   } = message;

  //   return swapTokenSolJup(amount, fromToken, toToken, fromAddress);
  }

  throw new Error(`Unsupported chain: ${fromChain}`);
}
