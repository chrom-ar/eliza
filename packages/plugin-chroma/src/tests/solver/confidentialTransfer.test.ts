import { describe, it, expect } from 'vitest';
import { validateAndBuildConfidentialTransfer } from '../../solver/confidentialTransfer';
import type { GeneralMessage } from '../../solver/helpers';

// Tests for the confidential transfer solver action

describe('validateAndBuildConfidentialTransfer', () => {
  it('returns null if fromChain is missing', async () => {
    const message = {
      timestamp: Date.now(),
      replyTo: 'test',
      body: { fromChain: '', type: 'CONFIDENTIAL_TRANSFER' }
    } as unknown as GeneralMessage;

    const result = await validateAndBuildConfidentialTransfer(message);
    expect(result).toBeNull();
  });

  it('returns correct partialTransactions for valid input', async () => {
    const message = {
      timestamp: Date.now(),
      replyTo: 'test',
      body: {
        fromChain: 'ethereum',
        type: 'CONFIDENTIAL_TRANSFER'
      }
    } as unknown as GeneralMessage;

    const result = await validateAndBuildConfidentialTransfer(message);
    // Should not error
    expect(result).not.toBeNull();
    const res = result as any;

    // Top-level properties
    expect(res).toHaveProperty('description', 'Confidential transfer on ethereum');
    expect(res).toHaveProperty('titles');
    expect(Array.isArray(res.titles)).toBe(true);
    expect(res.titles).toEqual(['Confidential Transfer']);

    expect(res).toHaveProperty('calls');
    expect(Array.isArray(res.calls)).toBe(true);
    expect(res.calls).toEqual(['deposit', 'relay']);

    // Partial transactions
    expect(res).toHaveProperty('partialTransactions');
    expect(Array.isArray(res.partialTransactions)).toBe(true);
    expect(res.partialTransactions).toHaveLength(2);

    const [depositTx, relayTx] = res.partialTransactions;

    // Deposit partial transaction
    expect(depositTx).toHaveProperty('to');
    expect(depositTx.callData.functionName).toBe('deposit');
    expect(typeof depositTx.callValue).toBe('string');
    expect(depositTx.callValue).toContain('deposit amount');

    // Relay partial transaction
    expect(relayTx).toHaveProperty('to');
    expect(relayTx.callData.functionName).toBe('relay');
    expect(typeof relayTx.callValue).toBe('string');
    expect(relayTx.callValue).toContain('non-payable');
  });
});
