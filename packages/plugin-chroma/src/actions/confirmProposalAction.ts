import {
  Action,
  HandlerCallback,
  IAgentRuntime,
  ModelClass,
  Memory,
  MemoryManager,
  State,
  composeContext,
  elizaLogger,
  generateObject,
} from '@elizaos/core';
import { z } from 'zod';

import { getWalletAndProvider, sendTransaction } from '../utils';
import { getStoredWallet } from '../utils/walletData';

const contextTemplate = `# Recent Messages
{{recentMessages}}

# Providers data
{{providers}}

Extract intent number from the message.
If no number is specified, use "1" as the default.`;

const numberSchema = z.object({
  number: z.number().int().positive().default(1),
});

export const confirmProposalAction: Action = {
  name: 'CONFIRM_PROPOSAL',
  similes: ['PROPOSAL_CONFIRMATION', 'CONFIRM_OPERATION'],
  description: 'Checks if user wants to confirm the proposal and proceed',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Invalid action without wallets handler
    if (!runtime.getSetting('CHROMA_CDP_API_KEY_NAME')) {
      return false;
    }

    const text = message.content.text.toLowerCase();
    return /\b(confirm|yes|ok|go|proceed)\b/i.test(text);
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State, _options, callback: HandlerCallback): Promise<boolean> => {
    // 1. Get the stored (pending) proposal
    const proposalManager = new MemoryManager({ runtime, tableName: 'proposals' });
    const [proposalsMem] = await proposalManager.getMemories({
      roomId: message.roomId,
      count:  1,
      unique: true
    })

    const proposals = (proposalsMem?.content?.proposals || []) as any[];

    let proposal;
    switch (proposals.length || 0) {
      case 0:
        callback({ text: 'Sorry, I could not find a pending proposal to confirm. Please create a new request.' });
        return false;
      case 1:
        proposal = proposals[0];
        break;
      default:
        // get proposal index from message
        const context = composeContext({
          state: state,
          template: contextTemplate
        })
        const { number } = (await generateObject({
          runtime,
          modelClass: ModelClass.SMALL,
          schema: numberSchema,
          schemaName: 'ProposalNumber',
          context
        })).object as z.infer<typeof numberSchema>;
        console.log("Parsed number from prompt:", number)

        proposal = proposals.find((proposal) => proposal.proposalNumber == number);
        break;
    }

    console.log("Proposal :", proposal)

    if (!proposal || (typeof proposal !== 'object')) {
      callback({ text: 'Sorry, I could not find a pending proposal to confirm. Please create a new request.' });
      return false;
    }

    // Check if user already has a wallet
    const existingWallet = await getStoredWallet(runtime, message.userId);

    if (!existingWallet) {
      callback({ text: 'Sorry, We need a wallet to continue. Do you want me to create a wallet?' });
      return false;
    }

    let wallet, provider;
    try {
      [wallet, provider] = await getWalletAndProvider(runtime, existingWallet.walletId);
    } catch (error) {
      console.log(error)
      elizaLogger.error('Error importing existing wallet:', error);
      callback({ text: 'Sorry, there was an error importing your wallet. Please try again.' });
      return false;
    }

    await proposalManager.removeAllMemories(message.roomId);

    // Excecute proposal via wallet provider
    let links = ''

    try {
        // @ts-ignore
      const transactions = proposal.transactions || []
        // @ts-ignore
      if (proposal.transaction) {
        // @ts-ignore
        transactions.push(proposal.transaction)
      }

      let i = 0
      for (let transaction of transactions) {
        // tx = await provider.sendTransaction(proposal.transaction);
        // TMP: Default agent SDK fails with `provider.sendTransaction`
        const tx = await sendTransaction(provider, transaction, true);

        // @ts-ignore
        links += `- ${proposal.titles[i]}: ${tx.transactionLink}\n`
        i += 1
      }

      // @ts-ignore
      callback({ text: `Transactions completed! \n${links}` });
      return false
    } catch (error) {
      console.log(error)
      elizaLogger.error('Error sending transactions:', error);
      if (links.length > 0) {
        callback({ text: 'Sorry, a few transactions succeeded but not all of them. Confirmed transactions: \n' + links });
      } else {
        callback({ text: 'Sorry, there was an error creating the transaction. Please try again.' });
      }

      return false;
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Confirming the proposal...',
          action: 'CONFIRM_PROPOSAL'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes, confirm number 2' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Confirming the proposal...',
          action: 'CONFIRM_PROPOSAL'
        }
      }
    ]
  ]
};
