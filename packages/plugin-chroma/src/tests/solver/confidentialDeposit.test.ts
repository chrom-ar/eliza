import { describe, it, expect } from 'vitest';
import { validateAndBuildConfidentialDeposit } from '../../solver/confidentialDeposit';
import type { GeneralMessage } from '../../solver/helpers';

import { ProposalResponseSchema, type ProposalResponse } from '@chrom-ar/solver-sdk';

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

    const result: ProposalResponse = await validateAndBuildConfidentialDeposit(message);
    expect(result).not.toBeNull();

    ProposalResponseSchema.parse(result); // ensure the result matches the expected schema

    expect(result).toHaveProperty('description', 'Confidential deposit via Privacy Pools on ethereum');
    expect(result.titles).toEqual(['Confidential Deposit']);
    expect(result.calls).toEqual(['deposit']);
    expect(result.partialTransactions).toHaveLength(1);

    const [depositTx] = result.partialTransactions;
    expect(depositTx.callData.functionName).toBe('deposit');
    expect(typeof depositTx.callValue).toBe('string');
    expect(depositTx.callValue).toContain('deposit amount');
  });
});
