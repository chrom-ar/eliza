import {
  validateAndBuildTransaction,
  buildSignedTransactionResponse,
} from './transaction_helpers';

export const buildResponse = async (event: any, config: object) => {
  const transaction = validateAndBuildTransaction(event);

  let response: object;

  console.log('index.ts:9', transaction);

  if (!transaction) {
    response = {
      error: 'Invalid message. Missing one or more required fields (amount, token, recipientAddress, recipientChain).'
    };
  } else {
    response = await buildSignedTransactionResponse(transaction, config);
  }

  console.log("Responding: ", response)

  return response;
}
