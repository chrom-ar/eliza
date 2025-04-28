import { mainnet } from 'viem/chains';
import { GeneralMessage } from './helpers';

const ENTRYPOINT_ADDRESS = '0x6818809eefce719e480a7526d76bd3e561526b46';

const RELAY_ABI = [
  {
    type: 'function',
    name: 'relay',
    inputs: [
      {
        name: '_withdrawal',
        type: 'tuple',
        internalType: 'struct IPrivacyPool.Withdrawal',
        components: [
          { name: 'processooor', type: 'address', internalType: 'address' },
          { name: 'data', type: 'bytes', internalType: 'bytes' }
        ]
      },
      {
        name: '_proof',
        type: 'tuple',
        internalType: 'struct ProofLib.WithdrawProof',
        components: [
          { name: 'pA', type: 'uint256[2]', internalType: 'uint256[2]' },
          { name: 'pB', type: 'uint256[2][2]', internalType: 'uint256[2][2]' },
          { name: 'pC', type: 'uint256[2]', internalType: 'uint256[2]' },
          { name: 'pubSignals', type: 'uint256[8]', internalType: 'uint256[8]' }
        ]
      },
      { name: '_scope', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  }
];

const PARTIAL_RELAY = {
  to: ENTRYPOINT_ADDRESS,
  chainId: mainnet.id,
  callData: {
    abi: RELAY_ABI,
    functionName: 'relay',
    argDescriptions: [
      {
        name: '_withdrawal',
        type: 'tuple',
        modelInstructions: 'this should be completed with the processooor and data of the withdrawal (where the processooor is the recipient)'
      },
      {
        name: '_proof',
        type: 'tuple',
        modelInstructions: 'this should be completed with the groth16 proof for the withdrawal'
      },
      {
        name: '_scope',
        type: 'uint256',
        modelInstructions: 'this should be completed with the scope of the withdrawal (we only support ETH on Mainnet, so this value should ALWAYS be 4916574638117198869413701114161172350986437430914933850166949084132905299523)'
      }
    ]
  },
  callValue: 'leave callValue as zero; this function is non-payable'
};

export async function validateAndBuildConfidentialRelay(message: GeneralMessage): Promise<object> {
  const { body: { fromChain } } = message;

  if (!fromChain) {
    console.log('missing confidential relay fields', { fromChain });
    return null;
  }

  return {
    description: `Confidential relay via Privacy Pools on ${fromChain}`,
    titles: ['Confidential Relay'],
    calls: ['relay'],
    partialTransactions: [PARTIAL_RELAY],
  };
}
