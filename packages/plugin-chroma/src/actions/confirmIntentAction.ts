import { Action, Memory, IAgentRuntime, MemoryManager, State, HandlerCallback } from '@elizaos/core';

import { WakuClient } from '../lib/waku-client';
import { getDefaultWallet } from '../utils/walletData';
import { simulateTxs } from '../utils/simulation';
import { evaluateRisk } from '../utils/evaluateRisk';
import { storeProposals, formatProposalText } from '../utils/proposal';

const TIMEOUT = 15000;

interface ProposalHandlerOptions {
  runtime: IAgentRuntime;
  message: Memory;
  intent: any;
}

interface SubscriptionConfig {
  topic: string;
  handler: (receivedMessage: any) => Promise<void>;
  options?: {
    encrypted?: boolean;
    expirationSeconds?: number;
  };
}

const setupSubscriptions = async (waku: any, configs: SubscriptionConfig[]) => {
  for (const config of configs) {
    await waku.subscribe(
      config.topic,
      config.handler,
      config.options
    );
  }
};

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

const handleProposals = async (options: ProposalHandlerOptions) => {
  const { runtime, message, intent } = options;
  let counter = 0;
  let finalText = '';

  const waku = await WakuClient.new(runtime);
  const proposals = [];
  const walletAddr = (await getDefaultWallet(runtime, message.userId))?.address;

  // TODO: Add `confidential` attr to intents when needed (Tested with if (true))
  if (intent.confidential) {
    const handshakeTopic = `handshake-${message.roomId}`;
    const confidentialTopic = `conf-${message.roomId}`;
    const handshakeExpiration = Date.now() + (TIMEOUT / 2);
    const totalExpiration = Date.now() + TIMEOUT;

    // Setup handshake subscription
    const handshakeConfig: SubscriptionConfig = {
      topic: handshakeTopic,
      handler: async (receivedMessage) => {
        if (Date.now() > handshakeExpiration) return;
        const { body: { signerPubKey } } = receivedMessage;

        await waku.sendMessage(
          intent,
          signerPubKey,
          confidentialTopic,
          signerPubKey,
        );
      }
    };

    // Setup proposal subscription
    const proposalConfig: SubscriptionConfig = {
      topic: confidentialTopic,
      handler: async (receivedMessage) => {
        if (Date.now() > totalExpiration) return;
        counter += 1;
        const proposal = await processProposal(runtime, counter, receivedMessage.body.proposal, walletAddr);
        if (proposal) {
          finalText += proposal.humanizedText;
          proposals.push(proposal);
        }
      },
      options: { encrypted: true, expirationSeconds: TIMEOUT }
    };

    await setupSubscriptions(waku, [handshakeConfig, proposalConfig]);

    // Send handshake message
    await waku.sendMessage(
      { type: intent.type, signerPubKey: waku.publicKey, replyTo: handshakeTopic },
      'handshake',
      handshakeTopic
    );

  } else {
    // Setup regular proposal subscription
    const proposalConfig: SubscriptionConfig = {
      topic: message.roomId,
      handler: async (receivedMessage) => {
        if (Date.now() > Date.now() + TIMEOUT) return;
        counter += 1;
        const proposal = await processProposal(runtime, counter, receivedMessage.body.proposal, walletAddr);
        if (proposal) {
          finalText += proposal.humanizedText;
          proposals.push(proposal);
        }
      }
    };

    await setupSubscriptions(waku, [proposalConfig]);

    // Send regular message
    await waku.sendMessage(
      intent,
      '',
      message.roomId
    );
  }

  // Wait for responses
  const timeToSleep = process.env.NODE_ENV == 'test' ? 500 : TIMEOUT;
  await new Promise((resolve) => setTimeout(resolve, timeToSleep));

  return { proposals, finalText };
};

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

    const { proposals, finalText } = await handleProposals({runtime, message, intent});

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
