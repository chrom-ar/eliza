import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback,
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { parseYieldAction } from '../../actions/parseYieldAction';
import { createRuntime } from '../helpers';
import { getDefaultWallet } from '../../utils/walletData';

// Mock default state used in tests
const mockState = {
    bio: '',
    lore: '',
    messageDirections: '',
    postDirections: '',
    recentMessages: '',
    responseContext: '',
    responseType: '',
    roomId: '123' as UUID,
    actors: '',
    recentMessagesData: []
};

// Mock wallet data
const mockWallet = {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    chains: ['base-sepolia', 'ethereum', 'optimism'],
    default: true,
    canSign: true
};

// Mock wallet getter
vi.mock('../../utils/walletData', () => ({
    getDefaultWallet: vi.fn().mockResolvedValue({
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        chains: ['base-sepolia', 'ethereum', 'optimism'],
        default: true,
        canSign: true
    })
}));

// Mock core functions
vi.mock('@elizaos/core', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-ignore
        ...actual,
        composeContext: vi.fn().mockImplementation(({state}) => {
            return state.recentMessages // faked for test
        }),
        generateObject: vi.fn().mockImplementation(async ({ schema, context }) => {
            // ETH yield with explicit chain
            if (context.includes('yield 1 ETH') && context.includes('optimism')) {
                return {
                    object: {
                        type: 'YIELD',
                        amount: '1',
                        fromToken: 'ETH',
                        recipientAddress: mockWallet.address,
                        fromChain: 'opt-sepolia'
                    }
                };
            }
            // ETH yield with no chain specified
            else if (context.includes('yield 1 ETH') && !context.includes('chain')) {
                return {
                    object: {
                        type: 'YIELD',
                        amount: '1',
                        fromToken: 'ETH',
                        recipientAddress: mockWallet.address,
                        fromChain: null
                    }
                };
            }
            // USDC yield on Base chain
            else if (context.includes('yield 100 USDC') && context.includes('Base')) {
                return {
                    object: {
                        type: 'YIELD',
                        amount: '100',
                        fromToken: 'USDC',
                        recipientAddress: mockWallet.address,
                        fromChain: 'base-sepolia'
                    }
                };
            }
            // USDT yield with no chain specified
            else if (context.includes('yield 50 USDT')) {
                return {
                    object: {
                        type: 'YIELD',
                        amount: '50',
                        fromToken: 'USDT',
                        recipientAddress: mockWallet.address,
                        fromChain: null
                    }
                };
            }
            return { object: {} };
        }),
        MemoryManager: vi.fn().mockImplementation(() => {
            return {
                removeAllMemories: vi.fn().mockResolvedValue(true),
                createMemory: vi.fn().mockResolvedValue(true)
            };
        }),
    };
});

describe('Parse Yield Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(parseYieldAction.name).toBe('PARSE_YIELD_INTENT');
            expect(parseYieldAction.similes).toContain('YIELD_INTENT');
        });
    });

    describe('Validation', () => {
        it('should validate messages containing yield keywords', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'I want to yield 1 ETH' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };
            expect(await parseYieldAction.validate(mockRuntime, message)).toBe(true);
        });

        it('should validate messages containing deposit keywords', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'I want to deposit 100 USDC' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };
            expect(await parseYieldAction.validate(mockRuntime, message)).toBe(true);
        });

        it('should validate messages containing invest keywords', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'I want to invest 50 USDT' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };
            expect(await parseYieldAction.validate(mockRuntime, message)).toBe(true);
        });

        it('should validate messages containing "to" and crypto tokens', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'I want to send 1 ETH to an address' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };
            expect(await parseYieldAction.validate(mockRuntime, message)).toBe(true);
        });

        it('should not validate messages without yield-related keywords or tokens', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'What is the weather today?' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };
            expect(await parseYieldAction.validate(mockRuntime, message)).toBe(false);
        });
    });

    describe('Yield Intent Generation', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
            vi.clearAllMocks();
        });

        it('should handle ETH yield with explicit chain', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'yield 1 ETH on optimism' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[1][0]; // Second call contains the intent
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('1');
            expect(callbackArg.intent.fromToken).toBe('ETH');
            expect(callbackArg.intent.fromChain).toBe('opt-sepolia');
            expect(callbackArg.intent.recipientAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('YIELD');
        });

        it('should handle ETH yield with no chain specified (default to base-sepolia)', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'yield 1 ETH' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[1][0]; // Second call contains the intent
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('1');
            expect(callbackArg.intent.fromToken).toBe('ETH');
            expect(callbackArg.intent.fromChain).toBe('base-sepolia'); // Default applied
            expect(callbackArg.intent.recipientAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('YIELD');
        });

        it('should handle USDC yield on Base chain', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'yield 100 USDC on Base' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[1][0]; // Second call contains the intent
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('100');
            expect(callbackArg.intent.fromToken).toBe('USDC');
            expect(callbackArg.intent.fromChain).toBe('base-sepolia');
            expect(callbackArg.intent.recipientAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('YIELD');
        });

        it('should handle USDT yield with no chain specified (default to base-sepolia)', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'yield 50 USDT' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[1][0]; // Second call contains the intent
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('50');
            expect(callbackArg.intent.fromToken).toBe('USDT');
            expect(callbackArg.intent.fromChain).toBe('base-sepolia'); // Default applied
            expect(callbackArg.intent.recipientAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('YIELD');
        });

        it('should use existing wallet address', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'yield 1 ETH' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(getDefaultWallet).toHaveBeenCalledWith(mockRuntime, message.userId);
            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[1][0]; // Second call contains the intent
            expect(callbackArg.intent.recipientAddress).toBe(mockWallet.address);
        });
    });
});
