import { encodeFunctionData, parseUnits, zeroAddress } from 'viem';
// import {
//     getAssociatedTokenAddressSync,
//     createAssociatedTokenAccountInstruction,
//     TOKEN_PROGRAM_ID,
//     createTransferCheckedInstruction,
// } from "@solana/spl-token";

// import {
//     Connection,
//     PublicKey,
//     TransactionMessage,
//     SystemProgram,
//     clusterApiUrl,
//     VersionedTransaction,
// } from "@solana/web3.js";

import { getChainId, getTokenAddress, getTokenAmount, getTokenDecimals, isEvmChain } from '@chrom-ar/utils';

import { GeneralMessage } from "./helpers";

export async function validateAndBuildTransfer(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromChain,
      fromToken,
      fromAddress,
      recipientAddress,
    }
  } = message;
  // Check for missing fields (simple example)
  if (!amount || !fromChain || !fromToken || !recipientAddress) {
    console.log('missing transfer fields', { amount, fromChain, fromToken, recipientAddress });
    return null;
  }

  let tx;

  fromChain = fromChain.toUpperCase();
  fromToken = fromToken.toUpperCase();

  if (isEvmChain(fromChain)) {
    tx = _buildEvmTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress);
  // TODO: Add full Solana support
  // } else if (fromChain === "SOLANA") {
  //   tx = await _buildSolTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress);
  } else {
    console.log("Unsupported chain");
    return null
  }

  return {
    description: `Transfer`,
    titles: [
      'Transfer'
    ],
    calls: [
      `Transfer ${amount}${fromToken} from ${fromAddress} to ${recipientAddress}`,
    ],
    transactions: [tx]
  };
}


function _buildEvmTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): object {
  const tokenAddr = getTokenAddress(fromChain, fromToken);
  const tokenAmount = getTokenAmount(amount, fromChain, fromToken);

  if (!tokenAddr || !tokenAmount) {
    throw new Error(`Invalid token address or amount for chain ${fromChain} and token ${fromToken}`);
  }

  const chainId = getChainId(fromChain);

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
  if (tokenAddr === zeroAddress) {
    return {
      to: recipientAddress,
      value: tokenAmount,
      chainId
    };
  } else {
    return {
      to: tokenAddr,
      value: 0,
      chainId,
      data: encodeFunctionData({abi: erc20Abi, functionName: "transfer", args: [recipientAddress, tokenAmount]})
    };
  }
}

// TODO: Add full Solana support
async function _buildSolTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): Promise<object> {
  const tokenAddr = getTokenAddress(fromChain, fromToken);
  const solToken = getTokenAddress("SOLANA", "SOL");

  if (!tokenAddr || !solToken) {
    throw new Error(`Invalid token address for chain ${fromChain} and token ${fromToken}`);
  }


  const decimals = getTokenDecimals(fromChain, fromToken);
  const tokenAmount = parseUnits(amount, decimals);
  const from = new PublicKey(fromAddress);
  const recipient = new PublicKey(recipientAddress);

  const instructions = [];
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed"); // TODO: Use config for env

  if (tokenAddr === solToken) {
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
