import { Plugin } from '@elizaos/core';

import { SolverService } from './services/solver';
import { walletEvaluator } from './evaluators/wallet';
import { walletProvider } from './providers/wallet';
import {
  parseSwapAction,
  parseBridgeAction,
  parseTransferAction,
  confirmIntentAction,
  cancelIntentAction
} from './actions';

export const chromaPlugin: Plugin = {
  name: 'plugin-chroma',
  description: 'Converts user queries to structured intents and broadcasts them',
  actions: [
    parseSwapAction,
    parseBridgeAction,
    parseTransferAction,
    confirmIntentAction,
    cancelIntentAction,
  ],
  evaluators: [walletEvaluator],
  providers: [walletProvider],
  services: [new SolverService()]
};
