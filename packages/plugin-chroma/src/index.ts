import { Plugin } from '@elizaos/core';
import { parseSwapAction } from './actions/parseSwapAction';
import { parseTransferAction } from './actions/parseTransferAction';
import { confirmIntentAction } from './actions/confirmIntentAction';
import { cancelIntentAction } from './actions/cancelIntentAction';
import { parseYieldAction } from './actions/parseYieldAction';
import { confirmProposalAction } from './actions/confirmProposalAction';
import { getBalanceAction } from './actions/getBalanceAction';
import { createWalletAction } from './actions/createWalletAction';

import { SolverService } from './services/solver';

import { walletEvaluator } from './evaluators/wallet';
import { walletProvider } from './providers/wallet';

const actions = [
  parseSwapAction,
  parseTransferAction,
  parseYieldAction,
  confirmIntentAction,
  cancelIntentAction,
]

// NOTE: Maybe there's a better way to filter actions
if (process.env.CHROMA_CDP_API_KEY_NAME) {
  actions.push(createWalletAction);
  actions.push(getBalanceAction);
  actions.push(confirmProposalAction);
}

export const chromaPlugin: Plugin = {
  name: 'plugin-chroma',
  description: 'Converts user queries to structured intents and broadcasts them',
  actions: actions,
  // evaluators: [walletEvaluator],
  // providers: [walletProvider],
  services: [new SolverService()]
};
