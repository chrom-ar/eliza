export default {
  "a2aVersion": "0.1.0",
  "version": "0.1.0",
  "agentId": "eliza-chroma-agent",
  "name": "Eliza Chroma DeFi Agent",
  "displayName": "Eliza Chroma DeFi Agent",
  "url": "http://localhost:3000/api/a2a",
  "description": "An agent specialized in understanding and executing DeFi actions via the Chroma plugin.",
  "endpointUrl": "/api/a2a",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "stateTransitionHistory": false,
    "methods": [
      "tasks/send",
      "tasks/get"
    ],
    "supportedInputParts": [
      "TextPart"
    ],
    "supportedOutputParts": [
      "TextPart",
      "DataPart"
    ],
    "supportedArtifactParts": [
      "TextPart",
      "DataPart"
    ]
  },
  "skills": [
    {
      "id": "GET_BALANCE",
      "name": "GET_BALANCE",
      "description": "Retrieves the balance of specified tokens for a wallet.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "walletAddress": {"type": "string"},
          "tokenSymbols": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["walletAddress"]
      },
      "outputSchema": {
         "type": "object",
         "properties": {
            "balances": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "symbol": {"type": "string"},
                        "amount": {"type": "string"}
                    }
                }
            }
         }
      }
    },
    {
      "id": "PARSE_TRANSFER_INTENT",
      "name": "PARSE_TRANSFER_INTENT",
      "description": "Parses a natural language request to transfer tokens."
    },
    {
      "id": "PARSE_SWAP_INTENT",
      "name": "PARSE_SWAP_INTENT",
      "description": "Parses a natural language request to swap tokens."
    },
    {
      "id": "PARSE_BRIDGE_INTENT",
      "name": "PARSE_BRIDGE_INTENT",
      "description": "Parses a natural language request to bridge tokens between chains."
    },
    {
       "id": "PARSE_YIELD_INTENT",
       "name": "PARSE_YIELD_INTENT",
       "description": "Parses a natural language request related to yield farming/staking."
    },
    {
        "id": "PARSE_CLAIM_INTENT",
        "name": "PARSE_CLAIM_INTENT",
        "description": "Parses a natural language request to claim rewards or tokens."
    },
    {
        "id": "PARSE_WITHDRAW_INTENT",
        "name": "PARSE_WITHDRAW_INTENT",
        "description": "Parses a natural language request to withdraw assets."
    },
    {
        "id": "CREATE_WALLET",
        "name": "CREATE_WALLET",
        "description": "Creates a new wallet."
    },
    {
        "id": "CONFIRM_INTENT",
        "name": "CONFIRM_INTENT",
        "description": "Confirms a previously parsed user intent."
    },
    {
        "id": "CANCEL_INTENT",
        "name": "CANCEL_INTENT",
        "description": "Cancels a previously parsed user intent."
    },
    {
        "id": "CONFIRM_PROPOSAL",
        "name": "CONFIRM_PROPOSAL",
        "description": "Confirms a proposal related to an intent."
    }
  ]
} 