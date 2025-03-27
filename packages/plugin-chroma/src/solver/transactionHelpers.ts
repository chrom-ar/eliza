import { GeneralMessage } from './helpers';

import { validateAndBuildTransfer } from './transfer';
import { validateAndBuildYield } from './yield';
import { validateAndBuildSwap } from './swap';
import { validateAndBuildBridge, validateAndBuildClaim } from './bridge';
import { validateAndBuildWithdraw } from './withdraw';
// import { validateAndBuildBestYield } from './bestYield';
import { Keypair } from '@solana/web3.js';
import nacl from "tweetnacl";
import tweetnaclUtils from 'tweetnacl-util';



/**
 * 1. Validate incoming data, ensuring all required fields are present.
 * 2. If valid, build a transaction object using 'viem'.
 */
export async function validateAndBuildProposal(message: GeneralMessage): Promise<object> {
  let result;

  switch (message.body.type?.toUpperCase()) {
    case "TRANSFER": // Not really necessary, but for demonstration purposes
      result = await validateAndBuildTransfer(message);
      break;
    case "YIELD":
      result = await validateAndBuildYield(message);
      break;
    case "WITHDRAW":
      result = await validateAndBuildWithdraw(message);
      break;
    case "SWAP":
      result = await validateAndBuildSwap(message);
      break;
    case "BRIDGE":
      result = await validateAndBuildBridge(message);
      break;
    case "CLAIM":
      result = await validateAndBuildClaim(message);
      break;
    // case "BEST_YIELD":
    //   result = await validateAndBuildBestYield(message);
    //   break;
    default:
      console.log('invalid type', message.body.type);
      return null;
  }

  if (!result) {
    return null;
  }

  return {
    ...message.body,
    toChain: message.body.recipientChain || message.body.fromChain,
    ...result
  }
}

/**
 * Helper to sign an arbitrary JSON payload using the configured PRIVATE_KEY.
 * This is a simplistic approach that signs a stringified version of `payload`.
 * For real-world usage, consider EIP-712 or structured data hashing.
 */
async function signPayload(payload: object, config: { PRIVATE_KEY: string }): Promise<{ signature: string; signer: string }> {
  const payloadString = JSON.stringify(payload);

  const account = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(config.PRIVATE_KEY)
    )
  );
  const signer = account.publicKey.toBase58();
  const signature = Buffer.from(
    nacl.sign.detached(
      tweetnaclUtils.decodeUTF8(payloadString),
      account.secretKey
    )
  ).toString('base64');

  return { signature, signer };
}

/**
 * Takes a valid transaction object and returns a "ready to broadcast" result
 *   that includes the transaction, signature, and the signer (public address).
 */
export async function buildSignedProposalResponse(proposal: any, config: any): Promise<object> {
  if (!proposal) {
    return null;
  }

  try {
    const { signature, signer } = await signPayload(proposal, config);

    return {
      proposal,
      signature,
      signer
    };
  } catch (e) {
    console.error("Signing", e);
    return null;
  }
}
