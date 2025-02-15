import { describe, it, expect, vi } from 'vitest';
import { validateAndBuildProposal, buildSignedProposalResponse } from '../../solver';
import { GeneralMessage } from '../../solver/transactionHelpers';

describe('Transaction Helpers', () => {
  describe('validateAndBuildProposal', () => {
    it('should validate and build a swap proposal', async () => {
      const message: GeneralMessage = {
        timestamp: Date.now(),
        roomId: 'test-room',
        body: {
          amount: '1',
          fromToken: 'ETH',
          toToken: 'USDC',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          fromChain: 'ethereum',
          recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          recipientChain: 'ethereum',
          type: 'SWAP'
        }
      };

      const result = await validateAndBuildProposal(message);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('type', 'SWAP');
      expect(result).toHaveProperty('amount', '1');
      expect(result).toHaveProperty('fromToken', 'ETH');
      expect(result).toHaveProperty('toToken', 'USDC');
    });

    it('should validate and build a bridge proposal', async () => {
      const message: GeneralMessage = {
        timestamp: Date.now(),
        roomId: 'test-room',
        body: {
          amount: '100',
          fromToken: 'USDC',
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          fromChain: 'sepolia',
          recipientAddress: 'F6HctpX9kbp6t1kdq82HVQRYpUGgJXMd4zGpzuuwdZCd',
          recipientChain: 'solana',
          type: 'BRIDGE'
        }
      };

      const result = await validateAndBuildProposal(message);
      expect(result).toBeTruthy();
      if (result) {
        expect('transactions' in result || 'transaction' in result).toBeTruthy();
      }
    });

    it('should return null for invalid messages', async () => {
      const invalidMessage = {
        timestamp: Date.now(),
        roomId: 'test-room',
        body: {
          // Missing required fields
        }
      };

      const result = await validateAndBuildProposal(invalidMessage as any);
      expect(result).toBeNull();
    });
  });

  describe('buildSignedProposalResponse', () => {
    it('should build a signed proposal response', async () => {
      const proposal = {
        type: 'SWAP',
        amount: '1',
        fromToken: 'ETH',
        toToken: 'USDC',
        fromChain: 'ethereum',
        toChain: 'ethereum'
      };

      const config = {
        PRIVATE_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234'
      };

      const result = await buildSignedProposalResponse(proposal, config);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('proposal');
    });

    it('should handle invalid proposals', async () => {
      const invalidProposal = null;
      const config = {
        PRIVATE_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234'
      };

      const result = await buildSignedProposalResponse(invalidProposal, config);
      expect(result).toBeNull();
    });
  });

  it('should build bridge transaction', async () => {
    // Add test implementation
  });
});
