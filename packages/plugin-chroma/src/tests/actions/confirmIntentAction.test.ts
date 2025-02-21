import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback,
    MemoryManager
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { confirmIntentAction } from '../../actions/confirmIntentAction';
import { createRuntime } from '../helpers';
import { WakuClient } from '../../lib/waku-client';
import { storeWallet } from '../../utils/walletData';

let mockMemoryManager: Partial<MemoryManager>;
let mockSimulationResult: Partial<object>;

// Mock the WakuClient
vi.mock('../../lib/waku-client', () => ({
    WakuClient: {
        new: vi.fn().mockImplementation(() => ({
            sendMessage: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockImplementation((roomId, callback) => {
                // Simulate receiving a message immediately
                callback({
                    body: {
                        proposal: {
                            description: "Transfer",
                            titles: ["Transfer"],
                            calls: ["Transfer"],
                            transaction: {
                                to: "0x123",
                                data: "0x123"
                            }
                        }
                    }
                });
                return true
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
                getMemories:          mockMemoryManager.getMemories,
                removeAllMemories:    mockMemoryManager.removeAllMemories,
                createMemory:         mockMemoryManager.createMemory,
                addEmbeddingToMemory: mockMemoryManager.addEmbeddingToMemory
            }
        })
    }
});

vi.mock('../../utils/simulation', async (importOriginal) => {
    // const actual = await importOriginal();
    return {
        simulateTxs: vi.fn().mockImplementation((r, w, txs) => {
            return mockSimulationResult
        })
    }
});


describe('Confirm Intent Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();
    mockSimulationResult = {
        results: [
            { summary: ['+ Transfer', '- Transfer', 'Link: https://www.tdly'], link: 'https://www.tdly' }
        ]
    }

    await storeWallet(mockRuntime, {userId: '123' as UUID} as Memory, { walletId: '0123-456', address: '0x123', network: 'base-sepolia' })

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
                intent: object;
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
                removeAllMemories: vi.fn().mockResolvedValue(undefined),
                createMemory: vi.fn().mockResolvedValue(undefined),
                addEmbeddingToMemory: vi.fn().mockImplementation(mem => mem)
            };
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
            expect(mockMemoryManager.removeAllMemories).toHaveBeenCalledWith(message.roomId);
            expect(mockMemoryManager.createMemory).toHaveBeenCalled();

            // Verify WakuClient interactions
            expect(WakuClient.new).toHaveBeenCalledWith(mockRuntime);

            // Verify callback was called with proposal
            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.proposals).toBeDefined();
            expect(callbackArg.proposals[0].transaction).toBeDefined();
            expect(callbackArg.text).toContain('Received 1 proposal');
            expect(callbackArg.text).toContain('Proposal #1: Transfer');
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
    });
});
