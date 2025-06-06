import { describe, it, expect, vi } from 'vitest';
// import { swapTokenSolJup } from '../../solver';

// TODO: Add Solana full support
describe.skip('swapToken', () => {
  it('should return a swap transaction', async () => {
    const swapData = await swapTokenSolJup(
      "0.12",
      "So11111111111111111111111111111111111111112",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "F6HctpX9kbp6t1kdq82HVQRYpUGgJXMd4zGpzuuwdZCd",
    );

    expect(swapData).toHaveProperty('quoteResponse');
    expect(swapData).toHaveProperty('serializedTransaction');
  });
});
