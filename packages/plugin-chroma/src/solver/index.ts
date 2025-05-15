import {
  validateAndBuildProposal,
  AVAILABLE_TYPES,
} from './transactionHelpers';
import {
  signProposal,
  signPayload,
} from './sign';
// import { swapToken as swapTokenSolJup } from './solJupiterSwap';
import { buildSwapTransaction } from './lifiEvmSwap';
import { buildBridgeTransaction } from './bridge/wormhole';
import { validateAndBuildYield } from './yield';
import { validateAndBuildWithdraw } from './withdraw';

export {
  validateAndBuildProposal,
  signProposal,
  signPayload,
  // swapTokenSolJup,
  buildSwapTransaction,
  buildBridgeTransaction,
  validateAndBuildYield,
  validateAndBuildWithdraw,
  AVAILABLE_TYPES,
};

export const buildResponse = async (event: any, config: object) => {
  try {
    const proposal = await validateAndBuildProposal(event);

    if (proposal) {
      return await signProposal(proposal, config);
    }
  } catch (error) {
    console.error('Error building response:', error);
  }
}
