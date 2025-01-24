import {
  validateAndBuildTransaction,
  buildSignedTransactionResponse,
} from './transaction_helpers';

export const buildResponse = async (event: any, config: object) => {
  const transaction = validateAndBuildTransaction(event);

  let response: object;

  if (transaction) {
    return await buildSignedTransactionResponse(transaction, config);
  }
}
