import { describe, it, expect, vi } from 'vitest';
import { buildSwapTransaction } from '../../solver';
import { getQuote } from '@lifi/sdk';
import { GeneralMessage } from '../../solver/helpers';

// Mock the helper functions that are used in the implementation
vi.mock('../../solver/helpers', async () => {
  const actual = await vi.importActual('../../solver/helpers');
  return {
    ...actual,
    getChainId: () => 1, // Ethereum mainnet
    getTokenAmount: () => '1000000', // Mock token amount
    getTokenAddress: () => '0x1111111111111111111111111111111111111111' // Mock token address
  };
});

vi.mock('@lifi/sdk', async () => {
  const actual = await vi.importActual('@lifi/sdk');
  return {
    ...actual,
    getQuote: vi.fn().mockResolvedValue({
      transactionRequest: {
        to: '0x2222222222222222222222222222222222222222',
        data: '0xdata',
        value: '1000000000000000000', // 1 ETH in wei
        gasPrice: '5000000000', // 5 gwei
        gasLimit: '200000'
      }
    }),
    createConfig: vi.fn().mockReturnValue({})
  };
});

vi.mock('viem', () => ({
  encodeFunctionData: vi.fn().mockReturnValue('0xmocked_data')
}));

describe('buildSwapTransaction', () => {
  it('should build a swap transaction', async () => {
    const message: GeneralMessage = {
      timestamp: Date.now(),
      roomId: 'test-room',
      body: {
        amount: '0.0001',
        fromToken: 'USDC',
        toToken: 'WETH',
        fromAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        fromChain: 'ethereum',
        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        recipientChain: 'ethereum',
        type: 'SWAP'
      }
    };

    const result = await buildSwapTransaction(message);

    // Check basic structure
    expect(result).toHaveProperty('transactions');
    expect(result.transactions.length).toBe(2); // Approve + swap

    // Check approval transaction
    expect(result.transactions[0]).toHaveProperty('chainId');
    expect(result.transactions[0]).toHaveProperty('to');
    expect(result.transactions[0]).toHaveProperty('value');
    expect(result.transactions[0]).toHaveProperty('data');

    // Check swap transaction
    expect(result.transactions[1]).toHaveProperty('to');
    expect(result.transactions[1]).toHaveProperty('data');
    expect(result.transactions[1]).toHaveProperty('value');
    expect(result.transactions[1]).toHaveProperty('gasPrice');
    expect(result.transactions[1]).toHaveProperty('gasLimit');

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
