import { Action, Memory, IAgentRuntime, HandlerCallback, State, ModelClass, generateText } from '@elizaos/core';

interface SwapIntent {
  intentType: string;
  user: string;
  deadline: number;
  chains: {
    origin: { identifier: string };
    destination: { identifier: string };
  };
  orderData: {
    sourceToken: string;
    destinationToken: string;
    amount: string;
  };
}

type SwapIntentData = {
  amount?: string;
  sourceToken?: string;
  destinationToken?: string;
}

export const parseSwapAction: Action = {
  name: 'PARSE_SWAP_INTENT',
  similes: ['SWAP_INTENT', 'CREATE_INTENT'],
  description: 'Parses user query and constructs a GaslessCrossChainIntent JSON for a swap',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Basic check if user query mentions "swap" or relevant tokens
    const text = message.content.text.toLowerCase();
    return text.includes('swap') ||
           (text.includes('from') && text.includes('to') && /eth|sol|btc|usdc|usdt/i.test(text));
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State, options: { [key: string]: unknown; }, callback: HandlerCallback): Promise<boolean> => {
    const text = message.content.text;
    const context = `
    Extract the following information from the user query:
    - The amount of tokens to swap
    - The source token
    - The destination token

    If the user query does not mention a swap, return an empty JSON object.

    This is the user query:

    \`\`\`
    ${text}
    \`\`\`

    Return ONLY the information in the following JSON format:

    \`\`\`json
    {
      "amount": "1",
      "sourceToken": "ETH",
      "destinationToken": "SOL"
    }
    \`\`\`
    `

    const response = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
        stop: ['```']
    });

    const parsedResponse = response.replace(/^```json\n/g, '').replace(/\n```$/g, '');

    let intentData: SwapIntentData = {};

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

    // Store the intent in the runtime state for confirmation
    //await runtime.setState('pendingIntent', intent);
    const responseText = `I've created a swap intent for ${intentData?.amount} ${intentData?.sourceToken} to ${intentData?.destinationToken}. Would you like to confirm this swap?`;

    const newMemory: Memory = {
        userId: message.userId,
        agentId: message.agentId,
        roomId: message.roomId,
        content: {
            text: responseText,
            action: 'PARSE_SWAP_INTENT',
            source: message.content?.source
        }
    };

    await runtime.messageManager.createMemory(newMemory);

    callback(newMemory.content);

    return true;
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Swap 1 ETH to SOL' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your swap intent...',
          action: 'PARSE_SWAP_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, swap 1 USDC to ETH' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Building your swap intent...',
          action: 'PARSE_SWAP_INTENT'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Hey {{user2}}, how are you doing?' }
      },
      {
        user: '{{user2}}',
        content: {
          text: 'Doing great!'
        }
      }
    ]
  ]
};