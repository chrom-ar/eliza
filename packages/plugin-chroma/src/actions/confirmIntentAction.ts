import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback } from '@elizaos/core';
import { WakuClient } from '../lib/waku-client';

import { getDefaultWallet } from '../utils/walletData';
import { simulateTxs } from '../utils/simulation';
import { evaluateRisk } from '../utils/evaluateRisk';
import { storeProposals, formatProposalText } from '../utils/proposal';

const TIMEOUT = 8000;

const processProposal = async (runtime: IAgentRuntime, counter: number, proposal: any, walletAddr: string) => {
  try {
    proposal.number = counter;
    const propTexts = formatProposalText(proposal) as any;

    // @ts-ignore
    const simulate = await simulateTxs(runtime, walletAddr, proposal.transactions) as any;

    const riskScore = await evaluateRisk(
      runtime,
      walletAddr,
      proposal.transactions,
      simulate
    ) as any[];

    let memoryText = propTexts.title; // Actions title

    for (let i in propTexts.actions) {
      memoryText += propTexts.actions[i]; // Action description

      if (riskScore[i]) {
        memoryText += riskScore[i].error || riskScore[i].summary;
      } else {
        memoryText += "No risk score available\n\n";
      }

      if (simulate.error) {
        memoryText += `Simulation error: ${simulate.error}\n\n`;
      } else {
        const result = simulate.results[i]; // Simulate description
        memoryText += 'Simulation:\n' + (result.error || result.summary.join("\n")) + "\n";
        memoryText += `Link: ${result.link}\n\n`;
      }
    }

    return { humanizedText: memoryText, proposalNumber: counter, simulation: simulate.results, riskScore, ...proposal };
  } catch (e) {
    console.error("Error inside subscription:", e);
  }
}

const handleIntent = async (runtime: IAgentRuntime, message: Memory, intent: any) => {
  let counter = 0;
  let finalText = '';

  const waku = await WakuClient.new(runtime);
  const proposals = [];
  const expiration = Date.now() + TIMEOUT;
  const walletAddr = (await getDefaultWallet(runtime, message.userId))?.address;

  // Subscribe to the room to receive the proposals
  await waku.subscribe(
    message.roomId,
    async (receivedMessage) => {
      if (Date.now() > expiration) {
        // TODO unsubscribe
        return;
      }

      counter += 1;
      const proposal = await processProposal(runtime, counter, receivedMessage.body.proposal, walletAddr);

      if (proposal) {
        finalText += proposal.humanizedText;
        proposals.push(proposal);
      }
    }
  )

  // Publish the *first* message to the "general" topic
  await waku.sendMessage(
    intent,
    '', // General intent topic
    message.roomId
  );

  // Sleep 10 seconds to wait for responses
  const timeToSleep = process.env.NODE_ENV == 'test' ? 500 : TIMEOUT;
  await (new Promise((resolve) => setTimeout(resolve, timeToSleep)));

  return { proposals, finalText }
}

const handleConfidentialIntent = async (runtime: IAgentRuntime, message: Memory, intent: any) => {
  let counter = 0;
  let finalText = '';

  const waku = await WakuClient.new(runtime);
  const proposals = [];
  const handshakeExpiration = Date.now() + (TIMEOUT / 2);
  const totalExpiration = Date.now() + TIMEOUT;
  const walletAddr = (await getDefaultWallet(runtime, message.userId))?.address;

  const handshakeTopic = `handshake-${message.roomId}`;
  const confidentialTopic = `conf-${message.roomId}`;

  // Subscribe to the handshake topic to send the intent
  await waku.subscribe(
    handshakeTopic,
    async (receivedMessage) => {
      if (Date.now() > handshakeExpiration) {
        // TODO unsubscribe
        return;
      }

      const { body } = receivedMessage;

      await waku.sendMessage(
        intent,
        body.signerPubKey, // the topic will be derived from the public key
        confidentialTopic, // where we want to receive the response
        body.signerPubKey, // public key  for the encryption
      );
    },
  )

  // Subscribe to the room to receive the proposals
  await waku.subscribe(
    confidentialTopic,
    async (receivedMessage) => {
      if (Date.now() > totalExpiration) {
        // TODO unsubscribe
        return;
      }

      counter += 1;
      const proposal = await processProposal(runtime, counter, receivedMessage.body.proposal, walletAddr);

      if (proposal) {
        finalText += proposal.humanizedText;
        proposals.push(proposal);
      }
    },
    { encrypted: true, expirationSeconds: TIMEOUT }
  )

  await waku.sendMessage(
    { type: intent.type, signerPubKey: waku.publicKey, replyTo: handshakeTopic }, // only send the type of operation we want to exec
    'handshake', // General handshake topic
    handshakeTopic // where we want to receive the response
  );

  // Sleep 10 seconds to wait for responses
  const timeToSleep = process.env.NODE_ENV == 'test' ? 500 : TIMEOUT;
  await (new Promise((resolve) => setTimeout(resolve, timeToSleep)));

  return { proposals, finalText }
}

export const confirmIntentAction: Action = {
  suppressInitialMessage: true,
  name: 'CONFIRM_INTENT',
  similes: ['INTENT_CONFIRMATION', 'CONFIRM_SWAP'],
  description: 'Checks if user wants to confirm the intent and proceed with broadcasting',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return /\b(confirm|yes|ok|go|proceed)\b/i.test(text);
  },

  handler: async (runtime: IAgentRuntime, message: Memory, _state: State, _options, callback: HandlerCallback): Promise<boolean> => {
    // 1. Get the stored (pending) intent
    const intentManager = new MemoryManager({ runtime, tableName: 'intents' });
    const [intentMemory] = await intentManager.getMemories({
      roomId: message.roomId,
      count: 1,
      unique: true
    });

    if (!intentMemory?.content?.intent) {
      callback({ text: 'Sorry, I could not find a pending intent to confirm. Please create a new request.' });
      return false;
    }

    const intent = intentMemory.content?.intent

    if (typeof intent !== 'object') {
      callback({ text: 'The last intent is not pending. Please create a new request.' });
      return false;
    }

    let proposals
    let finalText

    // if (true || intent.confidential) {
      ({ proposals, finalText } = await handleConfidentialIntent(runtime, message, intent))
    // } else {
    //   ({ proposals, finalText } = await handleIntent(runtime, message, intent))
    // }

    const counter = proposals.length;
    if (counter == 0) {
      callback({ text: 'No proposals received. Do you want to try again?' });
      return false;
    }

    // Remove the old memory
    await intentManager.removeAllMemories(message.roomId);

    // Persist the proposals
    await storeProposals(runtime, message.userId, message.roomId, {
      proposals,
      createdAt: Date.now()
    });

    await callback({ text: `Received ${counter} proposal${counter != 1 ? 's' : ''}:\n\n${finalText}\n\n Which do you want to confirm?`, proposals});

    // Do not respond to the user's message
    return false;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes, confirm' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Sending your intent...',
          action: 'CONFIRM_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Sending your intent...',
          action: 'CONFIRM_INTENT'
        }
      }
    ]
  ]
};
