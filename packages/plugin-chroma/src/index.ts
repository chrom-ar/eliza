import { Plugin } from '@elizaos/core';
import { parseSwapAction } from './actions/parseSwapAction';
import { parseTransferAction } from './actions/parseTransferAction';
import { confirmIntentAction } from './actions/confirmIntentAction';
import { cancelIntentAction } from './actions/cancelIntentAction';
import { MessageService } from './lib/messaging/service';
import { walletEvaluator } from './evaluators/wallet';
import { walletProvider } from './providers/wallet';

export const chromaPlugin: Plugin = {
  name: 'plugin-chroma',
  description: 'Converts user queries to structured intents and broadcasts them',
  actions: [
    parseSwapAction,
    parseTransferAction,
    confirmIntentAction,
    cancelIntentAction,
  ],
  evaluators: [walletEvaluator],
  providers: [walletProvider],
  services: [new MessageService()]
};
