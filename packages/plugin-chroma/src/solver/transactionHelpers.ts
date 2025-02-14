import { elizaLogger } from '@elizaos/core';
import { encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID,
    createTransferCheckedInstruction,
} from "@solana/spl-token";
import {
    Connection,
    PublicKey,
    TransactionMessage,
    SystemProgram,
    clusterApiUrl,
    VersionedTransaction,
} from "@solana/web3.js";

import { swapToken as swapTokenSolJup } from './solJupiterSwap';
import { EVMLiFiSwap } from './lifiEvmSwap';
import { buildBridgeTransaction } from './wormholeBridge';
export interface GeneralMessage {
  timestamp: number;
  roomId: string;
  body: {
    amount: string;
    fromToken: string;
    toToken?: string; // Optional for bridge operations
    fromAddress: string;
    fromChain: string;
    recipientAddress: string;
    recipientChain: string;
    status: string;
    deadline?: number;
    type?: 'swap' | 'bridge';
  };
}

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const TOKENS = {
  "ETHEREUM": {
    "ETH": ZERO_ADDRESS,
    "USDC": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  },
  "SOLANA": {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  }
}

const TOKEN_DECIMALS = {
  "ETHEREUM": {
    "ETH": 18,
    "USDC": 6
  },
  "SOLANA": {
    "SOL": 9,
    "USDC": 6
  }
}

// TODO: remove sepolia
const EVM_CHAINS = ["ETHEREUM", "SEPOLIA", "BASE"];

function isEvmChain(chain: string): boolean {
  return EVM_CHAINS.includes(chain.toUpperCase());
}

/**
 * 1. Validate incoming data, ensuring all required fields are present.
 * 2. If valid, build a transaction object using 'viem'.
 */
export async function validateAndBuildProposal(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromToken,
      toToken,
      fromAddress,
      fromChain,
      recipientAddress,
      recipientChain,
      type
    }
  } = message;

  // Check for missing fields (simple example)
  if (!amount || !fromToken || !fromAddress || !fromChain) {
    console.log('missing fields');
    return null;
  }

  // For bridge operations, toToken is not required
  if (!type || type === 'swap') {
    if (!toToken) {
      console.log('toToken is required for swap operations');
      return null;
    }
  }

  // Multiple chains are supported only for bridge operations
  if (recipientChain && fromChain !== recipientChain && (!type || type !== 'bridge')) {
    console.log('multi chain not supported for non-bridge operations');
    return null;
  }

  fromChain = fromChain.toUpperCase();
  fromToken = fromToken.toUpperCase();
  toToken = toToken?.toUpperCase();

  if (type === 'bridge') {
    if (!recipientAddress || !recipientChain) {
      console.log('recipientAddress and recipientChain are required for bridge operations');
      return null;
    }
    const bridgeResult = await buildBridgeTransaction(message);
    return bridgeResult.length === 1
      ? { transaction: bridgeResult[0] }
      : { transactions: bridgeResult };
  }

  let result;
  if (fromToken === toToken) {
    if (!recipientAddress) {
      console.log('recipientAddress is required for same token swap');
      return null;
    }
    result = { transaction: await _buildTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress) };
  } else {
    result = await _buildSwap(message);
  }

  // Complete the proposal object
  return {
    type,
    amount,
    fromToken,
    toToken,
    fromChain,
    toChain: recipientChain || fromChain,
    ...result
  };
}

/**
 * Helper to sign an arbitrary JSON payload using the configured PRIVATE_KEY.
 * This is a simplistic approach that signs a stringified version of `payload`.
 * For real-world usage, consider EIP-712 or structured data hashing.
 */
async function signPayload(payload: object, config: object): Promise<{ signature: string; signer: string }> {
  // @ts-ignore
  const account = privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`);

  const signer = account.address;
  const payloadString = JSON.stringify(payload);

  const signature = await account.signMessage({
    message: payloadString
  });

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

/**
 * Build a transfer transaction object.
 */
async function _buildTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): Promise<object> {
  if (isEvmChain(fromChain)) {
    return _buildEvmTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress);
  } else if (fromChain === "SOLANA") {
    return await _buildSolTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress);
  }
}

function _buildEvmTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): object {
  const tokenAddr = TOKENS[fromChain][fromToken];
  const tokenAmount = parseEther(amount, TOKEN_DECIMALS[fromChain][fromToken]).toString();

  const erc20Abi = [
    {
      "inputs": [
        { "name": "recipient", "type": "address" },
        { "name": "amount", "type": "uint256" }
      ],
      "name": "transfer",
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];

  // Native
  if (tokenAddr == ZERO_ADDRESS) {
    return {
      to: recipientAddress,
      value: tokenAmount
    };
  } else {
    return {
      to: tokenAddr,
      value: 0,
      data: encodeFunctionData({abi: erc20Abi, functionName: "transfer", args: [recipientAddress, tokenAmount]})
    };
  }
}


async function _buildSolTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): Promise<object> {
  const tokenAddr   = TOKENS[fromChain][fromToken];
  const decimals    = TOKEN_DECIMALS[fromChain][fromToken]
  const tokenAmount = parseEther(amount, decimals);
  const from        = new PublicKey(fromAddress);
  const recipient   = new PublicKey(recipientAddress);

  const instructions = [];
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed"); // TODO: Use config for env

  if (tokenAddr == TOKENS["SOLANA"]["SOL"]) {
    instructions.push(SystemProgram.transfer({
      fromPubkey: from,
      toPubkey:   recipient,
      lamports:   tokenAmount
    }));
  } else {
    const mint = new PublicKey(tokenAddr);
    const senderATA = getAssociatedTokenAddressSync(mint, from, true);
    const recipientATA = getAssociatedTokenAddressSync(mint, recipient, true);

    const recipientATAInfo = await connection.getAccountInfo(recipientATA);
    if (!recipientATAInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          from,
          recipientATA,
          recipient,
          mint
        )
      );
    }
    instructions.push(
      createTransferCheckedInstruction(
        senderATA, // source
        mint, // mint
        recipientATA, // destination
        from, // owner
        tokenAmount, // amount
        decimals, // decimals
        [], // signers
        TOKEN_PROGRAM_ID // programId TODO: Add support to the token2022
      )
    );
  }

  // Fee for the intent
  // const intentFee = 10;
  // instructions.push(
  //   SystemProgram.transfer({
  //     fromPubkey: ownerPubkey,
  //     toPubkey: recipientPubkey,
  //     lamports: intentFee
  //   })
  // );

  // Get the latest blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  // Create a new transaction message
  const messageV0 = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions
  }).compileToV0Message();

  // Create a new VersionedTransaction
  const transaction = new VersionedTransaction(messageV0);

  return {
    serializedTransaction: Buffer.from(transaction.serialize()).toString('base64'),
    lastValidBlockHeight
  };
}

async function _buildSwap(message: GeneralMessage): Promise<object> {
  const {
    body: {
      fromChain,
    }
  } = message;

  if (isEvmChain(fromChain)) {
    const evmSwap = new EVMLiFiSwap();
    return evmSwap.buildSwapTransaction(message);
  } else if (fromChain.toUpperCase() === "SOLANA") {
    const {
      body: {
        amount,
        fromToken,
        toToken,
        fromAddress,
      }
    } = message;

    return swapTokenSolJup(amount, fromToken, toToken, fromAddress);
  }

  throw new Error(`Unsupported chain: ${fromChain}`);
}
