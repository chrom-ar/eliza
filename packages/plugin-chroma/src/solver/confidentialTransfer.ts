import { GeneralMessage } from "./helpers";

const ENTRYPOINT_ADDRESS = "0x6818809eefce719e480a7526d76bd3e561526b46";

const DEPOSIT_ABI = [
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "_precommitment",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "_commitment",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  }
];

const RELAY_ABI = [
  {
    "type": "function",
    "name": "relay",
    "inputs": [
      {
        "name": "_withdrawal",
        "type": "tuple",
        "internalType": "struct IPrivacyPool.Withdrawal",
        "components": [
          {
            "name": "processooor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "data",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      },
      {
        "name": "_proof",
        "type": "tuple",
        "internalType": "struct ProofLib.WithdrawProof",
        "components": [
          {
            "name": "pA",
            "type": "uint256[2]",
            "internalType": "uint256[2]"
          },
          {
            "name": "pB",
            "type": "uint256[2][2]",
            "internalType": "uint256[2][2]"
          },
          {
            "name": "pC",
            "type": "uint256[2]",
            "internalType": "uint256[2]"
          },
          {
            "name": "pubSignals",
            "type": "uint256[8]",
            "internalType": "uint256[8]"
          }
        ]
      },
      {
        "name": "_scope",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
]

const partialDeposit = {
  to: ENTRYPOINT_ADDRESS,
  callData: {
    abi: DEPOSIT_ABI,
    functionName: "deposit",
    argDescriptions: [
      {
        name: "_precommitment",
        type: "uint256",
        modelInstructions: "this is the precommitment of the deposit"
      },
    ],
  },
  callValue: "this should be the deposit amount in wei; the model should fill this with the correct value for the deposit"
}

const partialRelay = {
  to: ENTRYPOINT_ADDRESS,
  callData: {
    abi: RELAY_ABI,
    functionName: "relay",
    argDescriptions: [
      {
        name: "_withdrawal",
        type: "tuple",
        modelInstructions: "this should be completed with the processooor and data of the withdrawal (where the processooor is the recipient)"
      },
      {
        name: "_proof",
        type: "tuple",
        modelInstructions: "this should be completed with the groth16 proof for the withdrawal"
      },
      {
        name: "_scope",
        type: "uint256",
        modelInstructions: "this should be completed with the scope of the withdrawal (for getting this, you should call the SCOPE function of the privacy pool contract)"
      }
    ]
  },
  callValue: "leave callValue as zero; this function is non-payable"
}

export async function validateAndBuildConfidentialTransfer(message: GeneralMessage): Promise<object> {
  const { body: { fromChain } } = message;

  if (!fromChain) {
    console.log('missing confidential transfer fields', { fromChain });
    return null;
  }

  return {
    description: `Confidential transfer on ${fromChain}`,
    titles: ['Confidential Transfer'],
    calls: ['deposit', 'relay'],
    partialTransactions: [partialDeposit, partialRelay],
  };
}
