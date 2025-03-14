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
    console.log('missing bridge fields', { amount, fromToken, fromAddress, fromChain });
    return null;
  }

  if (!recipientAddress || !recipientChain) {
    console.log('missing recipientAddress or recipientChain', { recipientAddress, recipientChain });
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
