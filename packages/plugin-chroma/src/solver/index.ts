import { elizaLogger} from '@elizaos/core';

import {
  validateAndBuildTransaction,
  buildSignedTransactionResponse,
} from './transaction_helpers';

export const buildResponse = async (event: any, config: object) => {
  console.log('MANSO-C buildResponse event', event);
  elizaLogger.info('MANSO-E buildResponse event', event);

  const transaction = validateAndBuildTransaction(event);

  let response: object;

  if (!transaction) {
    response = {
      error: 'Invalid message. Missing one or more required fields (amount, token, recipientAddress, recipientChain).'
    };
  } else {
    response = await buildSignedTransactionResponse(transaction, config);
  }

  return response;
}
