import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, generateText, MemoryManager } from '@elizaos/core';
import { TransferIntent } from '../lib/types';

export const parseTransferAction: Action = {
  name: 'PARSE_TRANSFER_INTENT',
  similes: ['TRANSFER_INTENT', 'SEND_INTENT'],
  description: 'Parses user query and constructs a GaslessCrossChainIntent JSON for a transfer',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();

    return text.includes('transfer') ||
           text.includes('send') ||
           ((text.includes('to') || text.includes('address')) && /eth|sol|btc|usdc|usdt/i.test(text));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State | undefined, _options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const text = message.content.text;
    const context = `
    Extract the following information from the user query:
    - The amount of tokens to transfer
    - The token type
    - The recipient address (if provided)
    - The recipient chain (if provided)

    If the user query does not mention a transfer, return an empty JSON object.

    This is the user query:

    \`\`\`
    ${text}
    \`\`\`

    Return ONLY the information in the following JSON format:

    \`\`\`json
    {
      "amount": "1",
      "token": "ETH",
      "fromAddress": "0x...",
      "fromChain": "ethereum",
      "recipientAddress": "0x...",
      "recipientChain": "ethereum"
    }
    \`\`\`

    - If the user mentions a deadline, add it to the JSON object as a timestamp in seconds.
    - If the user mentions a sender address, add it to the JSON object as a sender address. If no, assume the following: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266.
    - If no recipient address is provided, leave it as null.
    - If no recipient chain is specified, infer it from the token type.
    `

    const response = await generateText({
      runtime,
      context,
      modelClass: ModelClass.SMALL,
      stop: ['```']
    });

    const parsedResponse = response.replace(/^```json\n/g, '').replace(/\n```$/g, '');

    let intentData: TransferIntent = {};

    try {
      intentData = JSON.parse(parsedResponse);
    } catch (error) {
      console.error('Error parsing intent data', error);
      console.log('response', parsedResponse);
      return false;
    }

    console.log('intentData', intentData);

    if (Object.keys(intentData).length === 0) {
      callback(message.content);
      return true;
    }

    const { amount, token, recipientAddress, recipientChain } = intentData || {};
    const responseText = recipientAddress
      ? `I've created a transfer intent for ${amount} ${token} to ${recipientAddress} on ${recipientChain}. Would you like to confirm this transfer?`
      : `I've started creating a transfer intent for ${amount} ${token}. Please provide a recipient address to continue.`;

    const intentManager = new MemoryManager({
      runtime,
      tableName: 'intents'
    });

    await intentManager.removeAllMemories(message.roomId);

    const newMemory: Memory = await intentManager.addEmbeddingToMemory({
      userId: message.userId,
      agentId: message.agentId,
      roomId: message.roomId,
      createdAt: Date.now(),
      unique: true,
      content: {
        text: responseText,
        action: 'PARSE_TRANSFER_INTENT',
        source: message.content?.source,
        intent: {
          ...intentData,
          status: 'pending'
        }
      }
    });

    console.log('intent from parseTransferAction', newMemory.content.intent);

    await intentManager.createMemory(newMemory);

    callback(newMemory.content);

    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Transfer 1 ETH to 0x1234...5678' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your transfer intent...',
          action: 'PARSE_TRANSFER_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Send 100 USDC to my friend on Solana' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your transfer intent...',
          action: 'PARSE_TRANSFER_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how do I send crypto?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'I can help you transfer crypto. Just let me know how much and what token you want to send, and to which address.'
        }
      }
    ]
  ]
};