import { Plugin } from '@elizaos/core';

import { SolverService } from './services/solver';

import { walletEvaluator } from './evaluators/wallet';
import { walletProvider } from './providers/wallet';
import {
  cancelIntentAction,
  confirmIntentAction,
  confirmProposalAction,
  createWalletAction,
  getBalanceAction,
  parseBridgeAction,
  parseSwapAction,
  parseTransferAction,
  parseWithdrawAction,
  parseYieldAction,
} from './actions';

const actions = [
  cancelIntentAction,
  confirmIntentAction,
  getBalanceAction,
  parseBridgeAction,
  parseSwapAction,
  parseTransferAction,
  parseWithdrawAction,
  parseYieldAction,
]

// NOTE: Maybe there's a better way to filter actions
if (process.env.CHROMA_CDP_API_KEY_NAME) {
  actions.push(createWalletAction);
  actions.push(confirmProposalAction);
}

export const chromaPlugin: Plugin = {
  name: 'plugin-chroma',
  description: 'Converts user queries to structured intents and broadcasts them',
  actions: actions,
  evaluators: [walletEvaluator],
  providers: [walletProvider],
  services: [new SolverService()]
};
