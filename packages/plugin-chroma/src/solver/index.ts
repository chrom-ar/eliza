import {
  validateAndBuildProposal,
  buildSignedProposalResponse,
} from './transactionHelpers';
import { swapToken as swapTokenSolJup } from './solJupiterSwap';
import { EVMLiFiSwap, convertToChainKey } from './lifiEvmSwap';
import { buildBridgeTransaction } from './wormholeBridge';
import { validateAndBuildYield } from './yield';

export {
  validateAndBuildProposal,
  buildSignedProposalResponse,
  swapTokenSolJup,
  EVMLiFiSwap,
  convertToChainKey,
  buildBridgeTransaction,
  validateAndBuildYield,
};

export const buildResponse = async (event: any, config: object) => {
  try {
    const proposal = await validateAndBuildProposal(event);

    if (proposal) {
      return await buildSignedProposalResponse(proposal, config);
    }
  } catch (error) {
    console.error('Error building response:', error);
  }
}
