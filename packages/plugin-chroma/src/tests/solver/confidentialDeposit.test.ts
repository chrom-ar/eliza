import { describe, it, expect } from 'vitest';
import { validateAndBuildConfidentialDeposit } from '../../solver/confidentialDeposit';
import type { GeneralMessage } from '../../solver/helpers';

describe('validateAndBuildConfidentialDeposit', () => {
  it('returns null if fromChain is missing', async () => {
    const message = {
      timestamp: Date.now(),
      replyTo: 'test',
      body: { fromChain: '', type: 'CONFIDENTIAL_DEPOSIT' }
    } as unknown as GeneralMessage;

    const result = await validateAndBuildConfidentialDeposit(message);
    expect(result).toBeNull();
  });

  it('returns correct partialTransactions for valid input', async () => {
    const message = {
      timestamp: Date.now(),
      replyTo: 'test',
      body: { fromChain: 'ethereum', type: 'CONFIDENTIAL_DEPOSIT' }
    } as unknown as GeneralMessage;

    const result = await validateAndBuildConfidentialDeposit(message);
    expect(result).not.toBeNull();
    const res = result as any;

    expect(res).toHaveProperty('description', 'Confidential deposit via Privacy Pools on ethereum');
    expect(res.titles).toEqual(['Confidential Deposit']);
    expect(res.calls).toEqual(['deposit']);
    expect(res.partialTransactions).toHaveLength(1);

    const [depositTx] = res.partialTransactions;
    expect(depositTx.callData.functionName).toBe('deposit');
    expect(typeof depositTx.callValue).toBe('string');
    expect(depositTx.callValue).toContain('deposit amount');
  });
});
