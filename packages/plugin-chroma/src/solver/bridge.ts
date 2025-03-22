import { buildBridgeTransaction } from './bridge/wormhole';
import { buildBurnTransactions, buildClaimTransaction, isCCTPSupported } from './bridge/cctpv2';
import { GeneralMessage } from "./helpers";

export async function validateAndBuildBridge(message: GeneralMessage): Promise<object> {
  const {
    body: {
      amount,
      fromToken,
      fromAddress,
      fromChain,
      recipientChain,
    }
  } = message;

  if (!amount || !fromToken || !fromAddress || !fromChain || !recipientChain) {
    console.log('missing bridge fields', { amount, fromToken, fromAddress, fromChain, recipientChain });
    return null;
  }

  let bridgeResult: any;
  let calls: string[];

  // If token is USDC and both chains are supported by CCTPv2, use CCTPv2
  if (fromToken.toLowerCase() === 'usdc' && isCCTPSupported(fromChain, recipientChain)) {
    bridgeResult = await buildBurnTransactions(message);
    calls = ['CCTPv2 Approve', 'CCTPv2 Burn to bridge'];
  } else {
    bridgeResult = await buildBridgeTransaction(message);
    calls = ['Wormhole Approve', 'Wormhole CCTP Bridge'];
  }

  return {
    description: 'Bridge',
    titles: bridgeResult.map(tx => tx.description),
    calls,
    transactions: bridgeResult.map(tx => tx.transaction)
  };
}

export async function validateAndBuildClaim(message: GeneralMessage): Promise<object> {
  const {
    body: {
      fromChain,
      recipientChain,
      transactionHash
    }
  } = message;

  if (!transactionHash) {
    console.log('missing transaction hash', message);
    return null;
  }

  if (!isCCTPSupported(fromChain, recipientChain)) {
    throw new Error(`One or both chains (source: ${fromChain}, destination: ${recipientChain}) are not supported by CCTPv2`);
  }

  const claimResult = await buildClaimTransaction(fromChain, recipientChain, transactionHash);

  return {
    description: 'Claim CCTPv2',
    titles: claimResult.map(tx => tx.description),
    calls: [`CCTPv2 Claim`],
    transactions: claimResult.map(tx => tx.transaction)
  };
}
