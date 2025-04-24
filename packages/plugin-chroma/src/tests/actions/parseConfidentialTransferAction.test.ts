import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { parseConfidentialTransferAction } from '../../actions/parseConfidentialTransferAction';
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
        composeContext: vi.fn().mockImplementation(({ state }) => {
            return state.recentMessages; // faked for test
        }),
        generateObject: vi.fn().mockImplementation(async ({ schema, context }) => {
            if (context.includes('Ethereum')) {
                return { object: { fromChain: 'ethereum' } };
            } else if (context.includes('Solana')) {
                return { object: { fromChain: 'solana' } };
            }
            return { object: {} };
        }),
    };
});

describe('Parse Confidential Transfer Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(parseConfidentialTransferAction.name).toBe('PARSE_CONFIDENTIAL_TRANSFER_INTENT');
            expect(parseConfidentialTransferAction.similes).toContain('CONFIDENTIAL_TRANSFER_INTENT');
        });
    });

    describe('Validation', () => {
        it('should validate confidential transfer messages correctly', async () => {
            const validMessage: Memory = {
                id: '123' as UUID,
                content: { text: 'Make a confidential transfer on Ethereum' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const validMessage2: Memory = {
                id: '123' as UUID,
                content: { text: 'Make a private transfer on Solana' },
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

            expect(await parseConfidentialTransferAction.validate(mockRuntime, validMessage)).toBe(true);
            expect(await parseConfidentialTransferAction.validate(mockRuntime, validMessage2)).toBe(true);
            expect(await parseConfidentialTransferAction.validate(mockRuntime, invalidMessage)).toBe(false);
        });
    });

    describe('Confidential Transfer Intent Generation', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
        });

        it('should handle Ethereum chain', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'Make a confidential transfer on Ethereum' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseConfidentialTransferAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.fromChain).toBe('ethereum');
            expect(callbackArg.intent.type).toBe('CONFIDENTIAL_TRANSFER');
        });

        it('should handle Solana chain', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'Make a private transfer on Solana' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState, recentMessages: message.content.text };
            await parseConfidentialTransferAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            expect(mockCallback).toHaveBeenCalled();
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.intent).toBeDefined();
            expect(callbackArg.intent.fromChain).toBe('solana');
            expect(callbackArg.intent.type).toBe('CONFIDENTIAL_TRANSFER');
        });
    });
});
