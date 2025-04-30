export default {
  "a2aVersion": "0.1.0",
  "version": "0.1.0",
  "agentId": "eliza-chroma-agent",
  "name": "Eliza Chroma DeFi Agent",
  "displayName": "Eliza Chroma DeFi Agent",
  "url": "https://sandbox-api.chrom.ar/a2a",
  "description": "An agent specialized in understanding and executing DeFi actions via the Chroma plugin.",
  "endpointUrl": "/a2a",
  "capabilities": {
    "pushNotifications": false,
    "methods": [
      "tasks/send",
      "tasks/get",
      "tasks/sendSubscribe",
      "tasks/cancel"
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
      "description": "Gets ETH and USDC balance for the user's CDP wallet",
      "inputSchema": {
        "type": "object",
        "properties": {
          "walletAddress": {"type": "string", "description": "Wallet address (optional, defaults to user's primary wallet)"}
        }
      },
      "outputSchema": {
         "type": "object",
         "properties": {
           "text": {"type": "string", "description": "Textual summary of balances across networks"}
         }
      }
    },
    {
      "id": "PARSE_TRANSFER_INTENT",
      "name": "PARSE_TRANSFER_INTENT",
      "description": "Parses user query and constructs an intent for a transfer",
      "inputSchema": {
          "type": "object",
          "properties": {
              "query": {"type": "string", "description": "Natural language query for the transfer"}
          }
      },
      "outputSchema": {
          "type": "object",
          "properties": {
              "text": {"type": "string", "description": "Confirmation text for the parsed intent"},
              "intent": {
                  "type": "object",
                  "properties": {
                      "type": {"type": "string", "enum": ["TRANSFER"]},
                      "amount": {"type": "string"},
                      "fromToken": {"type": "string"},
                      "toToken": {"type": "string"},
                      "fromAddress": {"type": "string"},
                      "fromChain": {"type": "string"},
                      "recipientAddress": {"type": "string"}
                  }
              }
          }
      }
    },
    {
      "id": "PARSE_SWAP_INTENT",
      "name": "PARSE_SWAP_INTENT",
      "description": "Parses user query and constructs an intent for a swap",
       "inputSchema": {
          "type": "object",
          "properties": {
              "query": {"type": "string", "description": "Natural language query for the swap"}
          }
      },
      "outputSchema": {
          "type": "object",
          "properties": {
              "text": {"type": "string", "description": "Confirmation text for the parsed intent"},
              "intent": {
                  "type": "object",
                  "properties": {
                      "type": {"type": "string", "enum": ["SWAP"]},
                      "amount": {"type": "string"},
                      "fromToken": {"type": "string"},
                      "toToken": {"type": "string"},
                      "fromAddress": {"type": "string"},
                      "fromChain": {"type": "string"},
                      "recipientAddress": {"type": "string"},
                      "protocols": {"type": "array", "items": {"type": "string"}},
                      "deadline": {"type": "number"}
                  }
              }
          }
      }
    },
    {
      "id": "PARSE_BRIDGE_INTENT",
      "name": "PARSE_BRIDGE_INTENT",
      "description": "Parses user query and constructs a GaslessCrossChainIntent JSON for a bridge operation",
       "inputSchema": {
          "type": "object",
          "properties": {
              "query": {"type": "string", "description": "Natural language query for the bridge"}
          }
      },
      "outputSchema": {
          "type": "object",
          "properties": {
              "text": {"type": "string", "description": "Confirmation text for the parsed intent"},
              "intent": {
                  "type": "object",
                  "properties": {
                      "type": {"type": "string", "enum": ["BRIDGE"]},
                      "amount": {"type": "string"},
                      "fromToken": {"type": "string", "enum": ["USDC"]},
                      "fromAddress": {"type": "string"},
                      "fromChain": {"type": "string"},
                      "recipientAddress": {"type": "string"},
                      "recipientChain": {"type": "string"},
                      "protocols": {"type": "array", "items": {"type": "string"}},
                      "deadline": {"type": "number"}
                  }
              }
          }
      }
    },
    {
       "id": "PARSE_YIELD_INTENT",
       "name": "PARSE_YIELD_INTENT",
       "description": "Parses user query and constructs a yield intent",
        "inputSchema": {
          "type": "object",
          "properties": {
              "query": {"type": "string", "description": "Natural language query for yield/staking"}
          }
        },
        "outputSchema": {
          "type": "object",
          "properties": {
              "text": {"type": "string", "description": "Confirmation text for the parsed intent"},
              "intent": {
                  "type": "object",
                  "properties": {
                      "type": {"type": "string", "enum": ["YIELD"]},
                      "amount": {"type": "string"},
                      "fromToken": {"type": "string"},
                      "recipientAddress": {"type": "string"},
                      "fromChain": {"type": "string"},
                      "protocols": {"type": "array", "items": {"type": "string"}}
                  }
              }
          }
      }
    },
    {
        "id": "PARSE_CLAIM_INTENT",
        "name": "PARSE_CLAIM_INTENT",
        "description": "Parses user query and constructs a GaslessCrossChainClaim JSON for a claim operation",
        "inputSchema": {
          "type": "object",
          "properties": {
              "query": {"type": "string", "description": "Natural language query for claiming"}
          }
        },
        "outputSchema": {
          "type": "object",
          "properties": {
              "text": {"type": "string", "description": "Confirmation text for the parsed intent"},
              "intent": {
                  "type": "object",
                  "properties": {
                      "type": {"type": "string", "enum": ["CLAIM"]},
                      "fromChain": {"type": "string"},
                      "recipientChain": {"type": "string"},
                      "transactionHash": {"type": "string"},
                      "deadline": {"type": "number"}
                  }
              }
          }
        }
    },
    {
        "id": "PARSE_WITHDRAW_INTENT",
        "name": "PARSE_WITHDRAW_INTENT",
        "description": "Parses user query and constructs a withdrawal intent",
        "inputSchema": {
          "type": "object",
          "properties": {
              "query": {"type": "string", "description": "Natural language query for withdrawing assets"}
          }
        },
        "outputSchema": {
          "type": "object",
          "properties": {
              "text": {"type": "string", "description": "Confirmation text for the parsed intent"},
              "intent": {
                  "type": "object",
                  "properties": {
                      "type": {"type": "string", "enum": ["WITHDRAW"]},
                      "amount": {"type": "string"},
                      "fromToken": {"type": "string"},
                      "fromAddress": {"type": "string"},
                      "fromChain": {"type": "string"},
                      "protocol": {"type": ["string", "null"]},
                      "recipientAddress": {"type": "string"},
                      "recipientChain": {"type": "string"}
                  }
              }
          }
        }
    },
    {
        "id": "CREATE_WALLET",
        "name": "CREATE_WALLET",
        "description": "Creates or retrieves a CDP wallet for the user",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "User request to create/setup a wallet"}
            }
        },
        "outputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Confirmation message"},
                "walletAddress": {"type": "string"},
                "walletId": {"type": "string"}
            }
        }
    },
    {
        "id": "CONFIRM_INTENT",
        "name": "CONFIRM_INTENT",
        "description": "Checks if user wants to confirm the intent and proceed with broadcasting",
        "inputSchema": {
            "type": "object",
            "properties": {
                "confirmation": {"type": "string", "description": "User confirmation (e.g., 'yes', 'confirm')"}
            }
        },
        "outputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Summary of received proposals, asking for confirmation"},
                "proposals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "humanizedText": {"type": "string"},
                            "proposalNumber": {"type": "number"},
                            "simulation": {"type": "array"},
                            "riskScore": {"type": "array"},
                            "transactions": {"type": "array"}
                        }
                    }
                }
            }
        }
    },
    {
        "id": "CANCEL_INTENT",
        "name": "CANCEL_INTENT",
        "description": "Checks if user wants to cancel the intent and remove it from pending",
         "inputSchema": {
            "type": "object",
            "properties": {
                "cancellation": {"type": "string", "description": "User cancellation (e.g., 'no', 'cancel')"}
            }
        },
        "outputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Confirmation that the intent was canceled"}
            }
        }
    },
    {
        "id": "CONFIRM_PROPOSAL",
        "name": "CONFIRM_PROPOSAL",
        "description": "Checks if user wants to confirm the proposal and proceed, only available when using CDP wallet",
        "inputSchema": {
            "type": "object",
            "properties": {
                "confirmation": {"type": "string", "description": "User confirmation (e.g., 'yes', 'confirm')"},
                "proposalNumber": {"type": "number", "description": "Optional proposal number to confirm (defaults to 1)"}
            }
        },
        "outputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Result of the transaction execution (success with links or error message)"}
            }
        }
    }
  ]
}
