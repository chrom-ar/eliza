import {
  validateAndBuildTransaction,
  buildSignedTransactionResponse,
} from './transaction_helpers';

export const buildResponse = async (event: any, config: object) => {
  try {
    const transaction = await validateAndBuildTransaction(event);

    let response: object;

    if (transaction) {
      return await buildSignedTransactionResponse(transaction, config);
    }
  } catch (error) {
    console.error('Error building response:', error);
  }
}
