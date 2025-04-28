import { mainnet } from 'viem/chains';
import { GeneralMessage } from './helpers';

const ENTRYPOINT_ADDRESS = '0x6818809eefce719e480a7526d76bd3e561526b46';

const DEPOSIT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: '_precommitment', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [
      { name: '_commitment', type: 'uint256', internalType: 'uint256' }
    ],
    stateMutability: 'payable'
  }
];

const PARTIAL_DEPOSIT = {
  to: ENTRYPOINT_ADDRESS,
  // For now, we only support mainnet as Privacy Pools is not deployed on other chains
  chainId: mainnet.id,
  callData: {
    abi: DEPOSIT_ABI,
    functionName: 'deposit',
    argDescriptions: [
      {
        name: '_precommitment',
        type: 'uint256',
        modelInstructions: 'this is the precommitment of the deposit'
      }
    ]
  },
  callValue: 'this should be the deposit amount in wei; the model should fill this with the correct value for the deposit'
};

export async function validateAndBuildConfidentialDeposit(
  message: GeneralMessage
): Promise<object> {
  const {
    body: { fromChain }
  } = message;

  if (!fromChain) {
    console.log('missing confidential deposit fields', { fromChain });
    return null;
  }

  return {
    description: `Confidential deposit via Privacy Pools on ${fromChain}`,
    titles: ['Confidential Deposit'],
    calls: ['deposit'],
    partialTransactions: [PARTIAL_DEPOSIT]
  };
}
