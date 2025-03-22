import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { parseClaimAction } from '../../actions/parseClaimAction';
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
            if (context.includes('transaction 0x123456789abcdef')) {
                return {
                    object: {
                        fromChain: 'base-sepolia',
                        recipientChain: 'optimism-sepolia',
                        transactionHash: '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
                    }
                };
            } else if (context.includes('transaction hash 0xabcdef0123456789')) {
                return {
                    object: {
                        fromChain: 'base',
                        recipientChain: 'arbitrum',
                        transactionHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
                    }
                };
            } else if (context.includes('TX from Polygon to Base with hash 0x0123456789abcdef')) {
                return {
                    object: {
                        fromChain: 'polygon',
                        recipientChain: 'base',
                        transactionHash: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                        deadline: 1687654321
                    }
                };
            }
            return { object: {} };
        }),
    };
});

describe('Parse Claim Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(parseClaimAction.name).toBe('PARSE_CLAIM_INTENT');
            expect(parseClaimAction.similes).toContain('CLAIM_INTENT');
            expect(parseClaimAction.similes).toContain('CROSS_CHAIN_CLAIM');
        });
    });

    describe('Validation', () => {
        it('should validate claim messages correctly', async () => {
            const validMessages: Memory[] = [
                {
                    id: '123' as UUID,
                    content: { text: 'claim transaction 0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef from Base Sepolia to Optimism Sepolia' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                },
                {
                    id: '123' as UUID,
                    content: { text: 'I want to claim my tx hash 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789 from Base to Arbitrum' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                },
                {
                    id: '123' as UUID,
                    content: { text: 'claim my transaction from Polygon to Base with this hash: 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
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
                    content: { text: 'bridge 100 USDC from Sepolia to Optimism' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                }
            ];

            for (const validMessage of validMessages) {
                expect(await parseClaimAction.validate(mockRuntime, validMessage)).toBe(true);
            }
            for (const invalidMessage of invalidMessages) {
                expect(await parseClaimAction.validate(mockRuntime, invalidMessage)).toBe(false);
            }
        });
    });

    describe('Claim Intent Generation', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
        });

        it('should handle a transaction claim from Base Sepolia to Optimism Sepolia', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'claim transaction 0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef from Base Sepolia to Optimism Sepolia' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseClaimAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.fromChain).toBe('base-sepolia');
            expect(callbackArg.intent.recipientChain).toBe('optimism-sepolia');
            expect(callbackArg.intent.transactionHash).toBe('0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
            expect(callbackArg.intent.type).toBe('CLAIM');
        });

        it('should handle a transaction claim from Base to Arbitrum', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'I want to claim my transaction hash 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789 from Base to Arbitrum' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseClaimAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.fromChain).toBe('base');
            expect(callbackArg.intent.recipientChain).toBe('arbitrum');
            expect(callbackArg.intent.transactionHash).toBe('0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789');
            expect(callbackArg.intent.type).toBe('CLAIM');
        });

        it('should handle a transaction claim with deadline from Polygon to Base', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'claim my TX from Polygon to Base with hash 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseClaimAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.fromChain).toBe('polygon');
            expect(callbackArg.intent.recipientChain).toBe('base');
            expect(callbackArg.intent.transactionHash).toBe('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
            expect(callbackArg.intent.deadline).toBe(1687654321);
            expect(callbackArg.intent.type).toBe('CLAIM');
        });

        it('should handle invalid claim request gracefully', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'claim please' }, // Invalid because no transaction hash provided
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseClaimAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            // Should just pass through the original message when no valid intent can be parsed
            expect(mockCallback).toHaveBeenCalledWith(message.content);
        });
    });
});
