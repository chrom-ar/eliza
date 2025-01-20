import {
  validateAndBuildTransaction,
  buildSignedTransactionResponse,
} from './transaction_helpers';

export const buildResponse = async (event: any, config: object) => {
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
