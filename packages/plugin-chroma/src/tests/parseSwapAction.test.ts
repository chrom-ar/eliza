import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    ModelProviderName,
    AgentRuntime,
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { parseSwapAction } from '../actions/parseSwapAction';
import { createRuntime } from './helpers';

vi.mock('@elizaos/core', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-ignore
        ...actual,
        composeContext: vi.fn().mockImplementation(({state}) => {
            return state.recentMessages // faked for test
        }),
        generateObject: vi.fn().mockImplementation(async ({ schema, context }) => {
            if (context.includes('1 ETH to USDC')) {
                return {
                    object: {
                        amount: '1',
                        sourceToken: 'ETH',
                        destinationToken: 'USDC',
                        sourceChain: 'ethereum',
                        destinationChain: 'ethereum'
                    }
                };
            } else if (context.includes('100 USDC to ETH')) {
                return {
                    object: {
                        amount: '100',
                        sourceToken: 'USDC',
                        destinationToken: 'ETH',
                        sourceChain: 'ethereum',
                        destinationChain: 'ethereum'
                    }
                };
            } else if (context.includes('3 USDC to SOL')) {
                return {
                    object: {
                        amount: '3',
                        sourceToken: 'USDC',
                        destinationToken: 'SOL',
                        sourceChain: 'solana',
                        destinationChain: 'solana'
                    }
                };
            }
            return { object: {} };
        }),
    };
});

describe('Parse Swap Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(parseSwapAction.name).toBe('PARSE_SWAP_INTENT');
            expect(parseSwapAction.similes).toContain('SWAP_INTENT');
            expect(parseSwapAction.similes).toContain('CREATE_INTENT');
        });
    });

    describe('Validation', () => {
        it('should validate swap messages correctly', async () => {
            const validMessage: Memory = {
                id: '123' as UUID,
                content: { text: 'swap 1 ETH to USDC' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const validMessage2: Memory = {
                id: '123' as UUID,
                content: { text: 'I want to swap from ETH to USDC' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const invalidMessage: Memory = {
                id: '123' as UUID,
                content: { text: 'hello world' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            expect(await parseSwapAction.validate(mockRuntime, validMessage)).toBe(true);
            expect(await parseSwapAction.validate(mockRuntime, validMessage2)).toBe(true);
            expect(await parseSwapAction.validate(mockRuntime, invalidMessage)).toBe(false);
        });
    });

    describe('Swap Intent Generation', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
        });

        it('should handle ETH to USDC swap', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'swap 1 ETH to USDC' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await parseSwapAction.handler(mockRuntime, message, { recentMessages: message.content.text }, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('1');
            expect(callbackArg.intent.sourceToken).toBe('ETH');
            expect(callbackArg.intent.destinationToken).toBe('USDC');
            expect(callbackArg.intent.sourceChain).toBe('ethereum');
            expect(callbackArg.intent.destinationChain).toBe('ethereum');
        });

        it('should handle USDC to ETH swap', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'swap 100 USDC to ETH' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await parseSwapAction.handler(mockRuntime, message, { recentMessages: message.content.text }, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('100');
            expect(callbackArg.intent.sourceToken).toBe('USDC');
            expect(callbackArg.intent.destinationToken).toBe('ETH');
            expect(callbackArg.intent.sourceChain).toBe('ethereum');
            expect(callbackArg.intent.destinationChain).toBe('ethereum');
        });

        it('should handle USDC to SOL swap on solana chain', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'swap 3 USDC to SOL' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await parseSwapAction.handler(mockRuntime, message, { recentMessages: message.content.text }, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('3');
            expect(callbackArg.intent.sourceToken).toBe('USDC');
            expect(callbackArg.intent.destinationToken).toBe('SOL');
            expect(callbackArg.intent.sourceChain).toBe('solana');
            expect(callbackArg.intent.destinationChain).toBe('solana');
        });
    });
});