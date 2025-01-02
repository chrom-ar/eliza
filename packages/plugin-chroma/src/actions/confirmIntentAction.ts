import { Action, Memory, IAgentRuntime } from '@elizaos/core';

export const confirmIntentAction: Action = {
  name: 'CONFIRM_INTENT',
  similes: ['INTENT_CONFIRMATION', 'CONFIRM_SWAP'],
  description: 'Checks if user wants to confirm the intent and proceed with broadcasting',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return /\b(confirm|yes|ok|go|proceed)\b/i.test(text);
  },

  handler: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Retrieve the stored intent
    //const intent = await runtime.getState('pendingIntent');

    //if (!intent) {
    //  await runtime.sendMessage({
    //    content: {
    //      text: 'Sorry, I could not find a pending intent to confirm. Please create a new swap request.'
    //    }
    //  });
    //  return false;
    //}

    try {
      // In a real implementation, this would be your actual API endpoint
      const response = await fetch('https://api.example.com/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})  //intent)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      //await runtime.sendMessage({
      //  content: {
      //    text: 'Your swap intent has been successfully broadcast! You can track its status on the protocol.',
      //    data: { intent, status: 'broadcast' }
      //  }
      //});

      // Clear the pending intent
      //await runtime.setState('pendingIntent', null);
      return true;

    } catch (error) {
      //await runtime.sendMessage({
      //  content: {
      //    text: `Failed to broadcast the intent: ${error.message}`,
      //    error: true
      //  }
      //});
      return false;
    }
  },

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Yes, confirm the swap' }
      },
      {
        user: '{{agentName}}',
        content: {
          text: 'Broadcasting your swap intent...',
          action: 'CONFIRM_INTENT'
        }
      }
    ]
  ]
};