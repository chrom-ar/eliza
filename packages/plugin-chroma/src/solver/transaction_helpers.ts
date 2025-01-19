import { parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface GeneralMessage {
  timestamp: number;
  roomId: string;
  body: {
    amount: string;
    token: string;
    fromAddress: string;
    fromChain: string;
    recipientAddress: string;
    recipientChain: string;
    status: string;
  };
}

/**
 * 1. Validate incoming data, ensuring all required fields are present.
 * 2. If valid, build a transaction object using 'viem'.
 */
export function validateAndBuildTransaction(message: GeneralMessage): object {
  const {
    body: {
      amount,
      token,
      fromAddress,
      fromChain,
      recipientAddress,
      recipientChain,
    }
  } = message;

  console.log('transactionService.ts:27');
  // Check for missing fields (simple example)
  if (!amount || !token || !fromAddress || !fromChain || !recipientAddress || !recipientChain) {
    return null;
  }

  console.log('transactionService.ts:33');
  // Multiple chains are not supported yet
  if (fromChain !== recipientChain) {
    return null;
  }

  console.log('transactionService.ts:39');
  // In a real app, you'd tailor the transaction object to your needs:
  // - chainId could be derived from recipientChain
  // - 'to' is recipientAddress
  // - 'value' is parseEther(amount) if 'amount' is in Ether units, or
  //   parseUnits(amount, decimals) if you're using tokens. This is just an example.

  // For demonstration, let's assume it's a simple ETH transfer:
  const chainId = 1 // getChainIdByName(fromChain);
  const to = recipientAddress as `0x${string}`;
  // Should be a string so it can be serialized to JSON
  const value = parseEther(amount).toString(); // parse "0.75" -> string of wei
  const from = fromAddress as `0x${string}`;

  console.log('transactionService.ts:53');
  // Minimal transaction object for an EVM chain
  // (This is not necessarily all fields you'd set in production.)
  const transaction = {
    chainId,
    from,
    to,
    value,
    // Hardcode a gas price or fetch from network
    // Hardcode a nonce or let the wallet client figure it out
    // etc.
  };

  console.log('transactionService.ts:66', transaction);
  return transaction;
}

/**
 * Helper to sign an arbitrary JSON payload using the configured PRIVATE_KEY.
 * This is a simplistic approach that signs a stringified version of `payload`.
 * For real-world usage, consider EIP-712 or structured data hashing.
 */
async function signPayload(payload: object, config: object): Promise<{ signature: string; proposer: string }> {
  // @ts-ignore
  const account = privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`);

  const proposer = account.address;
  const payloadString = JSON.stringify(payload);

  const signature = await account.signMessage({
    message: payloadString
  });

  return { signature, proposer };
}

/**
 * Takes a valid transaction object and returns a "ready to broadcast" result
 *   that includes the transaction, signature, and the proposer (public address).
 */
export async function buildSignedTransactionResponse(transaction: any, config: any): Promise<object> {
  const { signature, proposer } = await signPayload(transaction, config);

  return {
    transaction,
    signature,
    proposer
  };
}
