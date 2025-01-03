import { Plugin } from '@elizaos/core';
import { parseSwapAction } from './actions/parseSwapAction';
import { confirmIntentAction } from './actions/confirmIntentAction';
import { cancelIntentAction } from './actions/cancelIntentAction';

export const chromaPlugin: Plugin = {
  name: 'plugin-chroma',
  description: 'Converts user queries to structured intents and broadcasts them',
  actions: [
    parseSwapAction,
    confirmIntentAction,
    cancelIntentAction,
  ],
  evaluators: [],
  providers: [],
};