import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback,
    MemoryManager
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { cancelIntentAction } from '../../actions';
import { createRuntime } from '../helpers';
import { SwapIntent } from '../../lib/types';

let mockMemoryManager: Partial<MemoryManager>;

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

describe('Cancel Intent Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(cancelIntentAction.name).toBe('CANCEL_INTENT');
            expect(cancelIntentAction.similes).toContain('INTENT_CANCELLATION');
            expect(cancelIntentAction.similes).toContain('CANCEL_SWAP');
        });
    });

    describe('Validation', () => {
        it('should validate cancel messages correctly', async () => {
            const validMessages: Memory[] = [
                {
                    id: '123' as UUID,
                    content: { text: 'cancel' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                },
                {
                    id: '123' as UUID,
                    content: { text: 'no, stop' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                },
                {
                    id: '123' as UUID,
                    content: { text: 'I regret it' },
                    userId: '123' as UUID,
                    agentId: '123' as UUID,
                    roomId: '123' as UUID
                }
            ];

            const invalidMessage: Memory = {
                id: '123' as UUID,
                content: { text: 'hello world' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            for (const validMessage of validMessages) {
                expect(await cancelIntentAction.validate(mockRuntime, validMessage)).toBe(true);
            }
            expect(await cancelIntentAction.validate(mockRuntime, invalidMessage)).toBe(false);
        });
    });

    describe('Intent Cancellation', () => {
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
        });

        it('should handle intent cancellation with pending intent', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'cancel' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await cancelIntentAction.handler(mockRuntime, message, undefined, {}, mockCallback as HandlerCallback);

            // Verify memory manager interactions
            expect(mockMemoryManager.getMemories).toHaveBeenCalled();
            expect(mockMemoryManager.removeMemory).toHaveBeenCalledWith(mockIntent.id);

            // Verify callback was called with success message
            expect(mockCallback).toHaveBeenCalledWith({
                text: 'Your swap intent has been canceled.'
            });
        });

        it('should handle missing intent gracefully', async () => {
            // Mock empty getMemories result
            mockMemoryManager.getMemories = vi.fn().mockResolvedValue([]);

            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'cancel' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await cancelIntentAction.handler(mockRuntime, message, undefined, {}, mockCallback as HandlerCallback);

            // Verify error message was sent
            expect(mockCallback).toHaveBeenCalledWith({
                text: 'There is no pending intent to cancel.'
            });
        });

        it('should handle intent without content gracefully', async () => {
            // Mock intent without content
            mockMemoryManager.getMemories = vi.fn().mockResolvedValue([{
                id: '123' as UUID,
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            }]);

            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'cancel' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            await cancelIntentAction.handler(mockRuntime, message, undefined, {}, mockCallback as HandlerCallback);

            // Verify error message was sent
            expect(mockCallback).toHaveBeenCalledWith({
                text: 'There is no pending intent to cancel.'
            });
        });
    });
});
