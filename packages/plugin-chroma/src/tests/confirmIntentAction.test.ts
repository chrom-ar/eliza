import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback,
    MemoryManager
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { confirmIntentAction } from '../actions/confirmIntentAction';
import { createRuntime } from './helpers';
import { WakuClient } from '../lib/waku-client';
import { SwapIntent } from '../lib/types';

let mockMemoryManager: Partial<MemoryManager>;

// Mock the WakuClient
vi.mock('../lib/waku-client', () => ({
    WakuClient: {
        new: vi.fn().mockImplementation(() => ({
            sendMessage: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockImplementation(async(roomId, callback) => {
                // Simulate receiving a message
                await callback({
                    body: {
                        type: 'proposal',
                        data: {
                            amount: '1',
                            sourceToken: 'ETH',
                            destinationToken: 'USDC',
                            sourceChain: 'ethereum',
                            destinationChain: 'ethereum'
                        }
                    }
                });
                return true;
            })
        }))
    }
}));

vi.mock('@elizaos/core', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-ignore
        ...actual,
        MemoryManager: vi.fn().mockImplementation(({runtime, tableName}) => {
            return {
                runtime,
                tableName,
                getMemories:  mockMemoryManager.getMemories,
                removeMemory: mockMemoryManager.removeMemory,
                createMemory: mockMemoryManager.createMemory
            }
        })
    }
});

describe('Confirm Intent Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(confirmIntentAction.name).toBe('CONFIRM_INTENT');
            expect(confirmIntentAction.similes).toContain('INTENT_CONFIRMATION');
            expect(confirmIntentAction.similes).toContain('CONFIRM_SWAP');
        });
    });

    describe('Validation', () => {
        it('should validate confirmation messages correctly', async () => {
            const validMessages = [
                'confirm',
                'yes',
                'ok',
                'go ahead',
                'proceed',
                'Yes, I want to confirm',
            ].map(text => ({
                id: '123' as UUID,
                content: { text },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            }));

            const invalidMessages = [
                'hello',
                'cancel',
                'stop',
                'what is this?'
            ].map(text => ({
                id: '123' as UUID,
                content: { text },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            }));

            for (const message of validMessages) {
                expect(await confirmIntentAction.validate(mockRuntime, message)).toBe(true);
            }

            for (const message of invalidMessages) {
                expect(await confirmIntentAction.validate(mockRuntime, message)).toBe(false);
            }
        });
    });

    describe('Intent Confirmation', () => {
        let mockCallback: Mock;
        let mockIntent: Memory & {
            content: {
                text: string;
                intent: SwapIntent;
            };
        };

        beforeEach(() => {
            mockCallback = vi.fn();

            // Create a mock intent
            mockIntent = {
                id: '123' as UUID,
                content: {
                    text: 'Swap intent created',
                    intent: {
                        amount: '1',
                        sourceToken: 'ETH',
                        destinationToken: 'USDC',
                        sourceChain: 'ethereum',
                        destinationChain: 'ethereum',
                        status: 'pending'
                    }
                },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            // Mock the memory manager
            mockMemoryManager = {
                getMemories: vi.fn().mockResolvedValue([mockIntent]),
                removeMemory: vi.fn().mockResolvedValue(undefined),
                createMemory: vi.fn().mockResolvedValue(undefined)
            };

            // Attach the mock memory manager to runtime
            // vi.spyOn(mockRuntime, 'memoryManager', 'get').mockReturnValue(mockMemoryManager as MemoryManager);
        });

        it('should handle intent confirmation with pending intent', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'confirm' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await confirmIntentAction.handler(mockRuntime, message, undefined, {}, mockCallback as HandlerCallback);

            // Verify memory manager interactions
            expect(mockMemoryManager.getMemories).toHaveBeenCalled();
            expect(mockMemoryManager.removeMemory).toHaveBeenCalledWith(mockIntent.id);
            expect(mockMemoryManager.createMemory).toHaveBeenCalled();

            // Verify WakuClient interactions
            expect(WakuClient.new).toHaveBeenCalledWith(mockRuntime);

            // Verify callback was called with proposal
            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.proposals).toBeDefined();
            expect(callbackArg.proposals[0].type).toBe('proposal');
        });

        it('should handle missing intent gracefully', async () => {
            // Mock empty getMemories result
            mockMemoryManager.getMemories = vi.fn().mockResolvedValue([]);

            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'confirm' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await confirmIntentAction.handler(mockRuntime, message, undefined, {}, mockCallback as HandlerCallback);

            // Verify error message was sent
            expect(mockCallback).toHaveBeenCalledWith({
                text: 'Sorry, I could not find a pending intent to confirm. Please create a new request.'
            });
        });

        it('should handle non-pending intent gracefully', async () => {
            // Mock intent with non-pending status
            mockIntent.content.intent = {
                amount: '1',
                sourceToken: 'ETH',
                destinationToken: 'SOL',
                sourceChain: 'ethereum',
                destinationChain: 'solana',
                status: 'confirmed'
            };
            mockMemoryManager.getMemories = vi.fn().mockResolvedValue([mockIntent]);

            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'confirm' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await confirmIntentAction.handler(mockRuntime, message, undefined, {}, mockCallback as HandlerCallback);

            // Verify error message was sent
            expect(mockCallback).toHaveBeenCalledWith({
                text: 'The last intent is not pending. Please create a new request.'
            });
        });
    });
});
