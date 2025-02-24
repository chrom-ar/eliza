import { buildBridgeTransaction } from './wormholeBridge';

import {
  GeneralMessage
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

  if (!amount || !fromToken || !fromAddress || !fromChain) {
    console.log('missing fields');
    return null;
  }

  if (!recipientAddress || !recipientChain) {
    console.log('recipientAddress and recipientChain are required for bridge operations');
    return null;
  }

  const bridgeResult = await buildBridgeTransaction(message);

  return {
    description: 'Bridge',
    titles: bridgeResult.map(tx => tx.description),
    calls: [`Wormhole CCTP Bridge`],
    transactions: bridgeResult.map(tx => tx.transaction)
  };
}
