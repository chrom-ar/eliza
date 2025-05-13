import { describe, it, expect } from 'vitest';
import { validateAndBuildConfidentialRelay } from '../../solver/confidentialRelay';
import type { GeneralMessage } from '../../solver/helpers';

describe('validateAndBuildConfidentialRelay', () => {
  it('returns null if fromChain is missing', async () => {
    const message = {
      timestamp: Date.now(),
      replyTo: 'test',
      body: { fromChain: '', type: 'CONFIDENTIAL_RELAY' }
    } as unknown as GeneralMessage;

    const result = await validateAndBuildConfidentialRelay(message);
    expect(result).toBeNull();
  });

  it('returns correct partialTransactions for valid input', async () => {
    const message = {
      timestamp: Date.now(),
      replyTo: 'test',
      body: { fromChain: 'ethereum', type: 'CONFIDENTIAL_RELAY' }
    } as unknown as GeneralMessage;

    const result = await validateAndBuildConfidentialRelay(message);
    expect(result).not.toBeNull();
    const res = result as any;

    expect(res).toHaveProperty('description', 'Confidential relay via Privacy Pools on ethereum');
    expect(res.titles).toEqual(['Confidential Relay']);
    expect(res.calls).toEqual(['relay']);

    expect(res.partialTransactions).toHaveLength(1);
    const [relayTx] = res.partialTransactions;
    expect(relayTx.callData.functionName).toBe('relay');
    expect(typeof relayTx.callValue).toBe('string');
    expect(relayTx.callValue).toContain('non-payable');
  });
});
