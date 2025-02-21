import { describe, it, expect, beforeAll } from 'vitest';
import { simulateTxs } from '../utils/simulation';
import type { IAgentRuntime } from '@elizaos/core';
import { createRuntime } from './helpers';


// Test configuration
const TEST_WALLET = '0x9539B9E9253136f7a7EBdEb32FC51393Ebc3a0A8'
const TEST_TX = {
  chainId: 137,
  to: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
  simulation_type: 'quick',
  data: '0x415565b00000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174000000000000000000000000df7837de1f2fa4631d716cf2502f8b230f1dcc320000000000000000000000000000000000000000000000000000000083a9a818000000000000000000000000000000000000000000000000000000000130330000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008c0000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000001bfd67037b42cf73acf2047067bd4f2c47d9bfd600000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000083a9a818000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000012556e69737761705633000000000000000000000000000000000000000000000000000000000000000000000083a9a8180000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000e592427a0aece92de3edee1f18e0157c058615640000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002b2791bca1f2de4661ed88a30c99a7a9449aa841740001f41bfd67037b42cf73acf2047067bd4f2c47d9bfd6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000460000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001bfd67037b42cf73acf2047067bd4f2c47d9bfd6000000000000000000000000df7837de1f2fa4631d716cf2502f8b230f1dcc3200000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000420000000000000000000000000000000000000000000000000000000000000042000000000000000000000000000000000000000000000000000000000000003e0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000420000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000001942616c616e6365725632000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000001303300000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000ba12222222228d8ba445958a75a0704d566bf2c80000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020e1e09ce7aac2740846d9b6d9d56f588c65314ecb000200000000000000000dbe00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000001bfd67037b42cf73acf2047067bd4f2c47d9bfd6000000000000000000000000df7837de1f2fa4631d716cf2502f8b230f1dcc32000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000030000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000001bfd67037b42cf73acf2047067bd4f2c47d9bfd6000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000000000000000000869584cd00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000482924891367b7358e',
  simulationExtras: {
    block_number: 68156419,
    save: true,
    save_if_fails: true,
    // estimate_gas: true,
  }
}

describe('Transaction Simulation Integration Tests', () => {
  let mockRuntime: IAgentRuntime;

  beforeAll(async () => {
    mockRuntime = await createRuntime();
    if (!process.env.TENDERLY_ACCOUNT || !process.env.TENDERLY_PROJECT || !process.env.TENDERLY_API_KEY) {
      throw new Error('Tenderly credentials required in environment variables');
    }
  });

  it('should successfully simulate a basic ETH transfer', async () => {
    // @ts-ignore
    const {error, results} = await simulateTxs(mockRuntime, TEST_WALLET, [TEST_TX]);

    expect(error).toBeUndefined()
    expect(results[0]).toHaveProperty('summary');
    expect(results[0].error).toBeUndefined();

    // Verify basic structure of the summary
    expect(results[0].summary[0]).toMatch(/- Transferred [\d.]+ /),
    expect(results[0].summary[1]).toMatch(/\+ Transferred [\d.]+ /),
    expect(results[0].summary[2]).toMatch(/\* Approve \+1M/)
    expect(results[0].link).toMatch(/https:\/\/www.tdly/)
  });

  it('should handle multiple transactions in a bundle', async () => {
    // @ts-ignore
    const {error, results} = await simulateTxs(mockRuntime, TEST_WALLET, [TEST_TX, TEST_TX]);

    expect(error).toBeUndefined()
    expect(results.length).toEqual(2);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBeUndefined();
  });

  it('should handle invalid simulations', async () => {
    const invalidTx = { ...TEST_TX, to: '0xinvalid' };
    // @ts-ignore
    const {error, results} = await simulateTxs(mockRuntime, TEST_WALLET, [invalidTx]);

    expect(error).toBeUndefined()
    expect(results.length).toEqual(1);
    expect(results[0].error).toBeDefined();
    expect(results[0].error).toContain('invalid transaction simulation');
  });

  it('should handle failed simulation for allowance', async () => {
    const approveZ = {
      chainId: 137,
      to: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // usdc
      simulation_type: 'quick',
      data: '0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000000000000000000',
      simulationExtras: {
        block_number: 68156419,
        save: true,
        save_if_fails: true,
        estimate_gas: true
      }
    }
    // @ts-ignore
    const {error, results} = await simulateTxs(mockRuntime, TEST_WALLET, [approveZ, TEST_TX]);

    expect(error).toBeUndefined()
    expect(results.length).toEqual(2);
    expect(results[0].error).toBeUndefined()
    expect(results[0].summary[0]).toMatch(/\* Approve 0 USDC/);
    expect(results[0].link).toMatch(/https:\/\/www.tdly/)

    expect(results[1].summary).toBeUndefined()
    expect(results[1].error).toEqual('ERC20: transfer amount exceeds allowance')
    expect(results[1].link).toMatch(/https:\/\/www.tdly/)
  })
});
