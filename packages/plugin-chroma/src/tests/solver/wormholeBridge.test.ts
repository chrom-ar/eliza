import { describe, it, expect, vi } from 'vitest';
import { buildBridgeTransaction } from '../../solver';
import { GeneralMessage } from '../../solver/transactionHelpers';

describe('Wormhole Bridge', () => {
  it('should build bridge transaction', async () => {
    const message: GeneralMessage = {
      timestamp: Date.now(),
      roomId: 'test-room',
      body: {
        amount: '0.0001',
        fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        fromAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        fromChain: 'sepolia',
        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        recipientChain: 'bsc',
        type: 'BRIDGE'
      }
    };

    const result = await buildBridgeTransaction(message);
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
    result.forEach(tx => {
      expect(tx).toHaveProperty('to');
      expect(tx).toHaveProperty('data');
    });
  });
});
