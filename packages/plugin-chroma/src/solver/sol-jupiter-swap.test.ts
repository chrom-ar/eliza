import { describe, it, expect, vi, beforeEach } from 'vitest';
import { swapToken as swapTokenSolJup } from './sol-jupiter-swap';

describe('swapToken', () => {
  it('should return a swap transaction', async () => {
    const swapData = await swapTokenSolJup(
      "0.12",
      "So11111111111111111111111111111111111111112",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "F6HctpX9kbp6t1kdq82HVQRYpUGgJXMd4zGpzuuwdZCd",
    );

    console.log(swapData)

    expect(swapData).toHaveProperty('swapData');
  });
});
