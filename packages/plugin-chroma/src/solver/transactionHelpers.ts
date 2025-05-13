import { GeneralMessage } from './helpers';
import { validateAndBuildTransfer } from './transfer';
import { validateAndBuildYield } from './yield';
import { validateAndBuildSwap } from './swap';
import { validateAndBuildBridge, validateAndBuildClaim } from './bridge';
import { validateAndBuildWithdraw } from './withdraw';
import { validateAndBuildConfidentialDeposit } from './confidentialDeposit';
import { validateAndBuildConfidentialRelay } from './confidentialRelay';

import { ProposalResponse } from '@chrom-ar/solver-sdk';

// Just for example purposes
const AVAILABLE_PROTOCOLS = [
  'aave',
  'curve',
  'lifi',
  // 'jupiter',
  // 'jup',
  'cctp',
  'cctpv2',
  'wormhole',
];

export const AVAILABLE_TYPES = [
  'TRANSFER',
  'YIELD',
  'SWAP',
  'BRIDGE',
  'CLAIM',
  'CONFIDENTIAL_DEPOSIT',
  'CONFIDENTIAL_RELAY',
];


/**
 * 1. Validate incoming data, ensuring all required fields are present.
 * 2. If valid, build a transaction object using 'viem'.
 */
export async function validateAndBuildProposal(message: GeneralMessage): Promise<ProposalResponse | null> {
  let result;

  const {
    body: {
      type,
      protocols
    }
  } = message;

  if (protocols && protocols.length > 0) {
    // TODO: Implement protocol selection
    const filteredProtocols = protocols.filter(protocol => AVAILABLE_PROTOCOLS.includes(protocol));

    if (filteredProtocols.length === 0) {
      console.log('no valid protocols', protocols);

      return null;
    }
  }

  console.log('DD transactionHelpers.ts:59');

  switch (type?.toUpperCase()) {
    case "TRANSFER": // Not really necessary, but for demonstration purposes
      result = await validateAndBuildTransfer(message);
      break;
    case "CONFIDENTIAL_DEPOSIT":
      result = await validateAndBuildConfidentialDeposit(message);
      break;
    case "CONFIDENTIAL_RELAY":
      result = await validateAndBuildConfidentialRelay(message);
      break;
    case "YIELD":
      result = await validateAndBuildYield(message);
      break;
    case "WITHDRAW":
      result = await validateAndBuildWithdraw(message);
      break;
    case "SWAP":
      result = await validateAndBuildSwap(message);
      break;
    case "BRIDGE":
      result = await validateAndBuildBridge(message);
      break;
    case "CLAIM":
      result = await validateAndBuildClaim(message);
      break;
    default:
      console.log('invalid type', message.body.type);
      return null;
  }

  if (!result) {
    return null;
  }

  return {
    ...message.body,
    toChain: message.body.recipientChain || message.body.fromChain,
    ...result
  }
}
