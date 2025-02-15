import { describe, it, expect } from 'vitest';
import { parseEther } from 'viem';
import { validateAndBuildProposal, buildSignedProposalResponse } from '../../solver';
import { GeneralMessage } from '../../solver/transactionHelpers';

describe('Transaction Helpers', () => {
  describe('validateAndBuildProposal', () => {
    it('should validate and build a swap proposal', async () => {
      const fromAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
      const message: GeneralMessage = {
        timestamp: Date.now(),
        roomId: 'test-room',
        body: {
          amount: '1',
          fromToken: 'ETH',
          toToken: 'USDC',
          fromAddress,
          fromChain: 'ethereum',
          recipientAddress: fromAddress,
          recipientChain: 'ethereum',
          status: 'pending',
          type: 'swap'
        }
      };

      // @ts-ignore
      const result = await validateAndBuildProposal(message);

      if (!result || !('transaction' in result)) {
        throw new Error('Invalid message');
      }

      const transaction = result.transaction;

      expect(transaction).toBeDefined();
      expect(transaction).toHaveProperty('value', parseEther('1').toString());
      // LiFiDiamond
      expect(transaction).toHaveProperty('to', '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE');
      expect(transaction).toHaveProperty('from', fromAddress);
      expect(transaction).toHaveProperty('chainId', 1);
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
          status: 'pending',
          type: 'bridge' as const
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
          status: 'pending'
        }
      };

      const result = await validateAndBuildProposal(invalidMessage as any);
      expect(result).toBeNull();
    });
  });

  describe('buildSignedProposalResponse', () => {
    it('should build a signed proposal response', async () => {
      const proposal = {
        type: 'swap',
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