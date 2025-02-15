import { describe, it, expect, vi } from 'vitest';
import { convertToChainKey, EVMLiFiSwap } from '../../solver';
import { ChainKey, getQuote } from '@lifi/sdk';
import { GeneralMessage } from '../../solver/transactionHelpers';

vi.mock('@lifi/sdk', async () => {
  const actual = await vi.importActual('@lifi/sdk');
  return {
    ...actual,
    getQuote: vi.fn().mockResolvedValue({
      transactionRequest: {
        to: '0x1234567890123456789012345678901234567890',
        data: '0x',
        value: '1000000000000000000',
        gasPrice: '5000000000',
        gasLimit: '200000'
      }
    }),
    createConfig: vi.fn().mockReturnValue({})
  };
});

describe('EVMLiFiSwap', () => {
  describe('buildSwapTransaction', () => {
    it('should build a swap transaction', async () => {
      const evmSwap = new EVMLiFiSwap();
      const message: GeneralMessage = {
        timestamp: Date.now(),
        roomId: 'test-room',
        body: {
          amount: '0.0001',
          fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
          toToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
          fromAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          fromChain: 'ethereum',
          recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          recipientChain: 'ethereum',
          status: 'pending',
          type: 'swap' as const
        }
      };

      const result = await evmSwap.buildSwapTransaction(message);
      expect(result).toHaveProperty('transaction');
      expect(result.transaction).toHaveProperty('value');
      expect(result.transaction).toHaveProperty('gasPrice');
      expect(result.transaction).toHaveProperty('gasLimit');

      // Verify the mock was called with correct parameters
      expect(getQuote).toHaveBeenCalledWith(expect.objectContaining({
        fromChain: 1, // Ethereum mainnet
        toChain: 1,
        fromToken: message.body.fromToken,
        toToken: message.body.toToken,
        fromAddress: message.body.fromAddress
      }));
    });
  });
});

describe('convertToChainKey', () => {
  it('should convert ethereum chain names correctly', () => {
    expect(convertToChainKey('ethereum')).toBe(ChainKey.ETH);
    expect(convertToChainKey('eth')).toBe(ChainKey.ETH);
    expect(convertToChainKey('mainnet')).toBe(ChainKey.ETH);
  });

  it('should convert polygon chain names correctly', () => {
    expect(convertToChainKey('polygon')).toBe(ChainKey.POL);
    expect(convertToChainKey('matic')).toBe(ChainKey.POL);
    expect(convertToChainKey('poly')).toBe(ChainKey.POL);
  });

  it('should convert arbitrum chain names correctly', () => {
    expect(convertToChainKey('arbitrum')).toBe(ChainKey.ARB);
    expect(convertToChainKey('arb')).toBe(ChainKey.ARB);
  });

  it('should handle case insensitivity', () => {
    expect(convertToChainKey('ETHEREUM')).toBe(ChainKey.ETH);
    expect(convertToChainKey('Polygon')).toBe(ChainKey.POL);
    expect(convertToChainKey('ARBITRUM')).toBe(ChainKey.ARB);
  });
}); 