import { encodeFunctionData, parseUnits } from 'viem';

import { buildBridgeTransaction } from './wormholeBridge';

import {
  AAVE_POOL,
  GeneralMessage,
  TOKENS,
  TOKEN_DECIMALS,
  ZERO_ADDRESS,
  isEvmChain,
} from "./helpers";

export async function validateAndBuildBridge(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromToken,
      fromAddress,
      fromChain,
      recipientAddress,
      recipientChain,
    }
  } = message;

  // Check for missing fields (simple example)
  if (!amount || !fromToken || !fromAddress || !fromChain) {
    console.log('missing fields');
    return null;
  }


  fromChain = fromChain.toUpperCase();
  fromToken = fromToken.toUpperCase();

  if (!recipientAddress || !recipientChain) {
    console.log('recipientAddress and recipientChain are required for bridge operations');
    return null;
  }
  const bridgeResult = await buildBridgeTransaction(message);
  return bridgeResult.length === 1
    ? { transaction: bridgeResult[0] }
    : { transactions: bridgeResult };
}
