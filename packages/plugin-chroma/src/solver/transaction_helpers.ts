import { encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface GeneralMessage {
  timestamp: number;
  roomId: string;
  body: {
    amount: string;
    fromToken: string;
    toToken: string;
    fromAddress: string;
    fromChain: string;
    recipientAddress: string;
    recipientChain: string;
    status: string;
  };
}

const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const TOKENS = {
  "ethereum": {
    "eth":  ZERO_ADDRESS,
    "usdc": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  },
}

const TOKEN_DECIMALS = {
  "ethereum": {
    "eth": 18,
    "usdc": 6
  },
}

const EVM_CHAINS = ["ethereum"];

function isEvmChain(chain: string): boolean {
  return EVM_CHAINS.includes(chain);
}

/**
 * 1. Validate incoming data, ensuring all required fields are present.
 * 2. If valid, build a transaction object using 'viem'.
 */
export function validateAndBuildTransaction(message: GeneralMessage): object {
  const {
    body: {
      amount,
      fromToken,
      toToken,
      fromAddress,
      fromChain,
      recipientAddress,
      recipientChain,
    }
  } = message;

  console.log("Validate and build transaction", message)

  // Check for missing fields (simple example)
  if (!amount || !fromToken || !toToken || !fromAddress || !fromChain || !recipientAddress || !recipientChain) {
    console.log('transaction_helpers.ts:63');
    return null;
  }

  // Multiple chains are not supported yet
  if (fromChain !== recipientChain) {
    console.log('transaction_helpers.ts:69');
    return null;
  }

  if (fromToken == toToken) {
    console.log('transaction_helpers.ts:74');
    return _buildTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress);
  } else {
    return _buildSwap(fromChain, fromToken, toToken, amount, fromAddress, recipientAddress);
  }
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
  try {
  const { signature, proposer } = await signPayload(transaction, config);

  return {
    transaction,
    signature,
    proposer
  };
  } catch (e) {
    console.error("Signing", e);
    return null;
  }
}

/**
 * Build a transfer transaction object.
 */
function _buildTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): object {
  if (isEvmChain(fromChain)) {
    console.log('transaction_helpers.ts:119');
    return _buildEvmTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress);
  } else if (fromChain === "solana") {
    return _buildSolTransfer(fromChain, fromToken, amount, fromAddress, recipientAddress);
  }
}

function _buildEvmTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): object {
  const tokenAddr = TOKENS[fromChain][fromToken];
  const tokenAmount = parseEther(amount, TOKEN_DECIMALS[fromChain][fromToken]).toString();

  const erc20Abi = [
    {
      "constant": false,
      "inputs": [
        {
          "name": "recipient",
          "type": "address"
        },
        {
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "name": "",
          "type": "bool"
        }
      ],
      "payable": false,
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];

  // Native
  if (tokenAddr == ZERO_ADDRESS) {
    console.log('transaction_helpers.ts:136');
    return {
      to: recipientAddress,
      value: tokenAmount
    };
  } else {
    console.log('transaction_helpers.ts:142');

    return {
      to: tokenAddr,
      value: 0,
      data: encodeFunctionData({abi: erc20Abi, functionName: "transfer", args: [recipientAddress, tokenAmount]})
    };
  }
}


function _buildSolTransfer(fromChain: string, fromToken: string, amount: string, fromAddress: string, recipientAddress: string): object {
  return {}
}

function _buildSwap(fromChain: string, fromToken: string, toToken: string, amount: string, fromAddress: string, recipientAddress: string): object {
  return {}
}
