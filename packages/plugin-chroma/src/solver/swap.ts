import {
  GeneralMessage,
  isEvmChain,
} from "./helpers";

import { swapToken as swapTokenSolJup } from './solJupiterSwap';
import { EVMLiFiSwap } from './lifiEvmSwap';


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
    console.log('missing fields');
    return null;
  }

  const swapResult = await _buildSwap(message);

  return {
    description: `Swap`,
    titles: [
      'Swap'
    ],
    calls: [
      'Swap'
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
    const evmSwap = new EVMLiFiSwap();
    return evmSwap.buildSwapTransaction(message);
  } else if (fromChain.toUpperCase() === "SOLANA") {
    const {
      body: {
        amount,
        fromToken,
        toToken,
        fromAddress,
      }
    } = message;

    return swapTokenSolJup(amount, fromToken, toToken, fromAddress);
  }

  throw new Error(`Unsupported chain: ${fromChain}`);
}
