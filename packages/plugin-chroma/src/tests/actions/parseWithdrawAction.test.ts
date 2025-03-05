import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback,
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { parseWithdrawAction } from '../../actions/parseWithdrawAction';
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
            // ETH withdrawal with explicit chain
            if (context.includes('withdraw 1 ETH') && context.includes('optimism')) {
                return {
                    object: {
                        type: 'WITHDRAW',
                        amount: '1',
                        fromToken: 'ETH',
                        fromAddress: mockWallet.address,
                        fromChain: 'opt-sepolia'
                    }
                };
            }
            // ETH withdrawal with no chain specified
            else if (context.includes('withdraw 1 ETH') && !context.includes('chain')) {
                return {
                    object: {
                        type: 'WITHDRAW',
                        amount: '1',
                        fromToken: 'ETH',
                        fromAddress: mockWallet.address,
                        fromChain: null
                    }
                };
            }
            // USDC withdrawal from Base chain
            else if (context.includes('withdraw 100 USDC') && context.includes('Base')) {
                return {
                    object: {
                        type: 'WITHDRAW',
                        amount: '100',
                        fromToken: 'USDC',
                        fromAddress: mockWallet.address,
                        fromChain: 'base-sepolia'
                    }
                };
            }
            // USDT withdrawal with no chain specified
            else if (context.includes('withdraw 50 USDT')) {
                return {
                    object: {
                        type: 'WITHDRAW',
                        amount: '50',
                        fromToken: 'USDT',
                        fromAddress: mockWallet.address,
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

describe('Parse Withdraw Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(parseWithdrawAction.name).toBe('PARSE_WITHDRAW_INTENT');
            expect(parseWithdrawAction.similes).toContain('WITHDRAW_INTENT');
        });
    });

    describe('Validation', () => {
        it('should validate withdraw messages correctly', async () => {
            const validMessages = [
                { text: 'withdraw 1 ETH from Aave' },
                { text: 'remove 50 USDC from my deposits' },
                { text: 'redeem my 2 ETH' },
                { text: 'take out 100 USDT' },
                { text: 'pull out 0.5 ETH from my account' },
                { text: 'I want to get my ETH from Aave' },
                { text: 'Can I retrieve my USDC from Aave deposit?' }
            ];

            const invalidMessages = [
                { text: 'hello world' },
                { text: 'what is the weather today?' },
                { text: 'show me my balance' },
                { text: 'I want to send ETH to someone' }
            ];

            for (const text of validMessages) {
                const validMessage: Memory = {
                    id: '123' as UUID,
                    content: { text: text.text },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                };
                expect(await parseWithdrawAction.validate(mockRuntime, validMessage)).toBe(true);
            }

            for (const text of invalidMessages) {
                const invalidMessage: Memory = {
                    id: '123' as UUID,
                    content: { text: text.text },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                };
                expect(await parseWithdrawAction.validate(mockRuntime, invalidMessage)).toBe(false);
            }
        });
    });

    describe('Withdraw Intent Generation', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
            vi.clearAllMocks();
        });

        it('should handle ETH withdrawal with explicit chain', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'withdraw 1 ETH from Aave on optimism' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseWithdrawAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('1');
            expect(callbackArg.intent.fromToken).toBe('ETH');
            expect(callbackArg.intent.fromChain).toBe('opt-sepolia');
            expect(callbackArg.intent.recipientChain).toBe('opt-sepolia');
            expect(callbackArg.intent.fromAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('WITHDRAW');
        });

        it('should handle ETH withdrawal with no chain specified (default to base-sepolia)', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'withdraw 1 ETH from my deposits' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseWithdrawAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('1');
            expect(callbackArg.intent.fromToken).toBe('ETH');
            expect(callbackArg.intent.fromChain).toBe('base-sepolia'); // Default applied
            expect(callbackArg.intent.recipientChain).toBe('base-sepolia');
            expect(callbackArg.intent.fromAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('WITHDRAW');
        });

        it('should handle USDC withdrawal from Base chain', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'withdraw 100 USDC from Aave on Base' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseWithdrawAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('100');
            expect(callbackArg.intent.fromToken).toBe('USDC');
            expect(callbackArg.intent.fromChain).toBe('base-sepolia');
            expect(callbackArg.intent.recipientChain).toBe('base-sepolia');
            expect(callbackArg.intent.fromAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('WITHDRAW');
        });

        it('should handle USDT withdrawal with no chain specified (default to base-sepolia)', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'withdraw 50 USDT from my account' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseWithdrawAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('50');
            expect(callbackArg.intent.fromToken).toBe('USDT');
            expect(callbackArg.intent.fromChain).toBe('base-sepolia'); // Default applied
            expect(callbackArg.intent.recipientChain).toBe('base-sepolia');
            expect(callbackArg.intent.fromAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.type).toBe('WITHDRAW');
        });

        it('should use existing wallet address', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'withdraw 1 ETH from my deposits' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseWithdrawAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(getDefaultWallet).toHaveBeenCalledWith(mockRuntime, message.userId);
            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent.fromAddress).toBe(mockWallet.address);
            expect(callbackArg.intent.recipientAddress).toBe(mockWallet.address);
        });
    });
});
