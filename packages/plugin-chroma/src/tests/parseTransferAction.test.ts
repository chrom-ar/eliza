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

import { parseTransferAction } from '../actions/parseTransferAction';
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
            if (context.includes('1 ETH')) {
                return {
                    object: {
                        amount: '1',
                        fromToken: 'ETH',
                        toToken: 'ETH',
                        fromAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                        fromChain: 'ethereum',
                        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
                        recipientChain: 'ethereum'
                    }
                };
            } else if (context.includes('100 USDC') && context.includes('Ethereum')) {
                return {
                    object: {
                        amount: '100',
                        fromToken: 'USDC',
                        toToken: 'USDC',
                        fromAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                        fromChain: 'ethereum',
                        recipientAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
                        recipientChain: 'ethereum'
                    }
                };
            } else if (context.includes('3 SOL')) {
                return {
                    object: {
                        amount: '3',
                        fromToken: 'SOL',
                        toToken: 'SOL',
                        fromAddress: 'DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF1',
                        fromChain: 'solana',
                        recipientAddress: 'DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF2',
                        recipientChain: 'solana'
                    }
                }
            } else if (context.includes('50 USDC') && context.includes('Solana')) {
                return {
                    object: {
                        amount: '50',
                        fromToken: 'USDC',
                        toToken: 'USDC',
                        fromAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                        fromChain: 'solana',
                        recipientAddress: 'DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF1',
                        recipientChain: 'solana'
                    }
                };
            }
            return { object: {} };
        }),
    };
});

describe('Parse Transfer Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime()

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(parseTransferAction.name).toBe('PARSE_TRANSFER_INTENT');
            expect(parseTransferAction.similes).toContain('TRANSFER_INTENT');
            expect(parseTransferAction.similes).toContain('SEND_INTENT');
        });
    });

    describe('Validation', () => {
        it('should validate transfer messages correctly', async () => {
            const validMessage: Memory = {
                id: '123' as UUID,
                content: { text: 'transfer 1 ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e' },
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

            expect(await parseTransferAction.validate(mockRuntime, validMessage)).toBe(true);
            expect(await parseTransferAction.validate(mockRuntime, invalidMessage)).toBe(false);
        });
    });

    describe('Transfer Intent Generation', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
        });

        it('should handle ETH transfer on Ethereum', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'transfer 1 ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await parseTransferAction.handler(mockRuntime, message, { recentMessages: message.content.text }, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('1');
            expect(callbackArg.intent.fromToken).toBe('ETH');
            expect(callbackArg.intent.fromChain).toBe('ethereum');
            expect(callbackArg.intent.recipientChain).toBe('ethereum');
            expect(callbackArg.intent.recipientAddress).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
        });

        it('should handle USDC transfer on Ethereum', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'send 100 USDC to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e on Ethereum' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await parseTransferAction.handler(mockRuntime, message, { recentMessages: message.content.text }, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('100');
            expect(callbackArg.intent.fromToken).toBe('USDC');
            expect(callbackArg.intent.fromChain).toBe('ethereum');
            expect(callbackArg.intent.recipientChain).toBe('ethereum');
            expect(callbackArg.intent.recipientAddress).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
        });

        it('should handle SOL transfer', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'transfer 3 SOL to DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF2' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await parseTransferAction.handler(mockRuntime, message, { recentMessages: message.content.text }, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('3');
            expect(callbackArg.intent.fromToken).toBe('SOL');
            expect(callbackArg.intent.fromAddress).toBe('DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF1');
            expect(callbackArg.intent.fromChain).toBe('solana');
            expect(callbackArg.intent.recipientChain).toBe('solana');
            expect(callbackArg.intent.recipientAddress).toBe('DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF2');
        });

        it('should handle USDC transfer on Solana', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'transfer 50 USDC to DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF1 on Solana' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await parseTransferAction.handler(mockRuntime, message, { recentMessages: message.content.text }, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.amount).toBe('50');
            expect(callbackArg.intent.fromToken).toBe('USDC');
            expect(callbackArg.intent.fromChain).toBe('solana');
            expect(callbackArg.intent.recipientChain).toBe('solana');
            expect(callbackArg.intent.recipientAddress).toBe('DRpbCBMxVnDK7maPGv7GLfPwk8S2wcxDzGPj6Y3AqVF1');
        });
    });
});
