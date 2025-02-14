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

import { parseBridgeAction } from '../../actions/parseBridgeAction';
import { createRuntime } from '../helpers';

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

vi.mock('@elizaos/core', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-ignore
        ...actual,
        composeContext: vi.fn().mockImplementation(({state}) => {
            return state.recentMessages // faked for test
        }),
        generateObject: vi.fn().mockImplementation(async ({ schema, context }) => {
            if (context.includes('100 USDC from Sepolia to Optimism')) {
                return {
                    object: {
                        amount: '100',
                        fromToken: 'USDC',
                        fromAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                        fromChain: 'sepolia',
                        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
                        recipientChain: 'optimism-sepolia'
                    }
                };
            } else if (context.includes('50 USDC from Base to Arbitrum')) {
                return {
                    object: {
                        amount: '50',
                        fromToken: 'USDC',
                        fromAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                        fromChain: 'base',
                        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
                        recipientChain: 'arbitrum'
                    }
                };
            } else if (context.includes('25 USDC from Polygon to Base')) {
                return {
                    object: {
                        amount: '25',
                        fromToken: 'USDC',
                        fromAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                        fromChain: 'polygon',
                        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
                        recipientChain: 'base'
                    }
                };
            }
            return { object: {} };
        }),
    };
});

describe('Parse Bridge Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(parseBridgeAction.name).toBe('PARSE_BRIDGE_INTENT');
            expect(parseBridgeAction.similes).toContain('BRIDGE_INTENT');
            expect(parseBridgeAction.similes).toContain('CROSS_CHAIN_INTENT');
        });
    });

    describe('Validation', () => {
        it('should validate bridge messages correctly', async () => {
            const validMessages: Memory[] = [
                {
                    id: '123' as UUID,
                    content: { text: 'bridge 100 USDC from Sepolia to Optimism' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                },
                {
                    id: '123' as UUID,
                    content: { text: 'I want to bridge USDC from Base to Arbitrum' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                },
                {
                    id: '123' as UUID,
                    content: { text: 'send USDC from chain Polygon to Base chain' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                }
            ];

            const invalidMessages: Memory[] = [
                {
                    id: '123' as UUID,
                    content: { text: 'hello world' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                },
                {
                    id: '123' as UUID,
                    content: { text: 'swap ETH to USDC' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                }
            ];

            for (const validMessage of validMessages) {
                expect(await parseBridgeAction.validate(mockRuntime, validMessage)).toBe(true);
            }
            for (const invalidMessage of invalidMessages) {
                expect(await parseBridgeAction.validate(mockRuntime, invalidMessage)).toBe(false);
            }
        });
    });

    describe('Bridge Intent Generation', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
        });

        it('should handle USDC bridge from Sepolia to Optimism-Sepolia', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'bridge 100 USDC from Sepolia to Optimism' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseBridgeAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('100');
            expect(callbackArg.intent.fromToken).toBe('USDC');
            expect(callbackArg.intent.fromChain).toBe('sepolia');
            expect(callbackArg.intent.fromAddress).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
            expect(callbackArg.intent.recipientChain).toBe('optimism-sepolia');
            expect(callbackArg.intent.recipientAddress).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
            expect(callbackArg.intent.type).toBe('bridge');
            expect(callbackArg.intent.status).toBe('pending');
        });

        it('should handle USDC bridge from Base to Arbitrum', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'bridge 50 USDC from Base to Arbitrum' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseBridgeAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('50');
            expect(callbackArg.intent.fromToken).toBe('USDC');
            expect(callbackArg.intent.fromChain).toBe('base');
            expect(callbackArg.intent.fromAddress).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
            expect(callbackArg.intent.recipientChain).toBe('arbitrum');
            expect(callbackArg.intent.recipientAddress).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
            expect(callbackArg.intent.type).toBe('bridge');
            expect(callbackArg.intent.status).toBe('pending');
        });

        it('should handle USDC bridge from Polygon to Base', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'bridge 25 USDC from Polygon to Base' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseBridgeAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('25');
            expect(callbackArg.intent.fromToken).toBe('USDC');
            expect(callbackArg.intent.fromChain).toBe('polygon');
            expect(callbackArg.intent.fromAddress).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
            expect(callbackArg.intent.recipientChain).toBe('base');
            expect(callbackArg.intent.recipientAddress).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
            expect(callbackArg.intent.type).toBe('bridge');
            expect(callbackArg.intent.status).toBe('pending');
        });

        it('should handle invalid bridge request gracefully', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'bridge ETH please' }, // Invalid because only USDC is supported
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseBridgeAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            // Should just pass through the original message when no valid intent can be parsed
            expect(mockCallback).toHaveBeenCalledWith(message.content);
        });
    });
}); 