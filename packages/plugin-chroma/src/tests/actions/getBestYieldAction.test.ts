import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    IAgentRuntime,
    Memory,
    UUID,
    HandlerCallback
} from '@elizaos/core';
import type { Mock } from 'vitest';

import { getBestYieldAction } from '../../actions/getBestYieldAction';
import { createRuntime } from '../helpers';

// Define a type that matches the ReserveData interface from aave.ts
interface MockReserveData {
    assetAddress: string;
    symbol: string;
    name: string;
    decimals: number;
    supplyAPY: number;
    userScaledATokenBalance?: bigint;
}

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

// Mock the modules using inline factory functions
vi.mock('../../utils/aave', () => {
    return {
        fetchAaveYieldData: vi.fn()
    };
});

vi.mock('../../utils/walletData', () => {
    return {
        getDefaultWallet: vi.fn()
    };
});

vi.mock('@elizaos/core', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-ignore
        ...actual,
        composeContext: vi.fn(),
        generateObject: vi.fn(),
    };
});

// Import the mocked modules after they've been mocked
import { fetchAaveYieldData } from '../../utils/aave';
import { getDefaultWallet } from '../../utils/walletData';
import { composeContext, generateObject } from '@elizaos/core';

// Mock callback for testing
const mockCallback = vi.fn();

describe('Get Best Yield Action', async () => {
    const mockRuntime: IAgentRuntime = await createRuntime();

    // Setup mock implementations before each test
    beforeEach(() => {
        vi.resetAllMocks();

        // Setup mocked wallet data implementation
        (getDefaultWallet as Mock).mockImplementation(async (runtime, userId) => {
            if (userId === 'user-with-wallet') {
                return {
                    address: '0xtestUserAddress',
                    chains: ['ethereum', 'optimism'],
                    default: true,
                    canSign: false
                };
            }
            return null;
        });

        // Setup mocked generateObject implementation
        (generateObject as Mock).mockResolvedValue({
            object: {
                networks: ['arb-sepolia', 'opt-sepolia'],
                asset: 'USDC'
            }
        });

        // Setup mocked composeContext implementation
        (composeContext as Mock).mockReturnValue('mocked-context');

        // Setup mocked aave data implementation
        (fetchAaveYieldData as Mock).mockImplementation(async (network, asset, userAddress) => {
            if (network === 'arb-sepolia') {
                const data: MockReserveData[] = [
                    {
                        assetAddress: '0xarbSepoliaAddress',
                        symbol: 'USDC',
                        name: 'USD Coin',
                        decimals: 6,
                        supplyAPY: 0.021 // 2.1%
                    }
                ];

                // Add user balance for arb-sepolia if user address matches the test address
                if (userAddress === '0xtestUserAddress') {
                    data[0].userScaledATokenBalance = BigInt(100);
                }

                return data;
            }

            if (network === 'opt-sepolia') {
                const data: MockReserveData[] = [
                    {
                        assetAddress: '0xoptSepoliaAddress',
                        symbol: 'USDC',
                        name: 'USD Coin',
                        decimals: 6,
                        supplyAPY: 0.035 // 3.5%
                    }
                ];

                // No balance on opt-sepolia for our test user
                if (userAddress === '0xtestUserAddress') {
                    data[0].userScaledATokenBalance = BigInt(0);
                }

                return data;
            }

            return [];
        });
    });

    describe('Action Configuration', () => {
        it('should have correct action name and similes', () => {
            expect(getBestYieldAction.name).toBe('GET_BEST_YIELD');
            expect(getBestYieldAction.similes).toContain('COMPARE_YIELDS');
            expect(getBestYieldAction.similes).toContain('BEST_YIELD_RATES');
        });
    });

    describe('Validation', () => {
        it('should validate best yield query messages correctly', async () => {
            const validMessage1: Memory = {
                id: '123' as UUID,
                content: { text: 'Which network has the best yield?' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const validMessage2: Memory = {
                id: '123' as UUID,
                content: { text: 'Compare yield rates between arb-sepolia and opt-sepolia' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const validMessage3: Memory = {
                id: '123' as UUID,
                content: { text: 'Is the yield on AAVE better in Optimism?' },
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

            expect(await getBestYieldAction.validate(mockRuntime, validMessage1)).toBe(true);
            expect(await getBestYieldAction.validate(mockRuntime, validMessage2)).toBe(true);
            expect(await getBestYieldAction.validate(mockRuntime, validMessage3)).toBe(true);
            expect(await getBestYieldAction.validate(mockRuntime, invalidMessage)).toBe(false);
        });
    });

    describe('Yield Comparison', () => {
        let mockCallback: Mock;

        beforeEach(() => {
            mockCallback = vi.fn();
        });

        it('should check both networks by default and return the best yield', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'Which network has the best yield?' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            // Mock generateObject to return both networks for this test
            (generateObject as Mock).mockResolvedValue({
                object: {
                    networks: ['arb-sepolia', 'opt-sepolia'],
                    asset: 'USDC'
                }
            });

            const state = { ...mockState };
            await getBestYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            // First callback should be the initial message about checking
            expect(mockCallback).toHaveBeenCalledTimes(1);

            // Get the response text and verify it contains the right information
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.text).toContain('opt-sepolia: 3.50% (Best Rate)');
            expect(callbackArg.text).toContain('arb-sepolia: 2.10%');
            expect(callbackArg.text).toContain('For the best yield, I recommend using opt-sepolia');
        });

        it('should include all available networks even when user asks about one specific network', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'What is the yield on arb-sepolia?' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            // Mock generateObject to return only arb-sepolia for this test
            (generateObject as Mock).mockResolvedValue({
                object: {
                    networks: ['arb-sepolia'],
                    asset: 'USDC'
                }
            });

            const state = { ...mockState };
            await getBestYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            // Check the response contains both networks for proper comparison
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.text).toContain('arb-sepolia: 2.10%');
            expect(callbackArg.text).toContain('opt-sepolia: 3.50% (Best Rate)');
            expect(callbackArg.text).toContain('For the best yield, I recommend using opt-sepolia');
        });

        it('should provide personalized recommendation for users with wallet', async () => {
            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'Am I getting the best yield?' },
                userId: 'user-with-wallet' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            // Mock generateObject to return both networks for this test
            (generateObject as Mock).mockResolvedValue({
                object: {
                    networks: ['arb-sepolia', 'opt-sepolia'],
                    asset: 'USDC'
                }
            });

            const state = { ...mockState };
            await getBestYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            // Verify that the response includes information about the user's current deposits
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.text).toContain('arb-sepolia: 2.10%');
            expect(callbackArg.text).toContain('You currently have funds deposited here');
            expect(callbackArg.text).toContain('opt-sepolia: 3.50% (Best Rate)');
            expect(callbackArg.text).toContain('You currently have funds in arb-sepolia, but opt-sepolia offers a better rate');
        });

        it('should report when all networks have errors', async () => {
            // Mock fetchAaveYieldData to throw an error for all calls
            (fetchAaveYieldData as Mock).mockRejectedValue(new Error('Test error'));

            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'Which network has the best yield?' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState };
            await getBestYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            // Check that an error message is returned
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.text).toContain('couldn\'t fetch yield data');
        });

        it('should handle when some networks return data and others error', async () => {
            // Make arb-sepolia throw an error but opt-sepolia return data
            (fetchAaveYieldData as Mock).mockImplementation(async (network, asset, userAddress) => {
                if (network === 'arb-sepolia') {
                    throw new Error('Test error for arb-sepolia');
                }

                if (network === 'opt-sepolia') {
                    return [
                        {
                            assetAddress: '0xoptSepoliaAddress',
                            symbol: 'USDC',
                            name: 'USD Coin',
                            decimals: 6,
                            supplyAPY: 0.035 // 3.5%
                        }
                    ];
                }

                return [];
            });

            const message: Memory = {
                id: '123' as UUID,
                content: { text: 'Which network has the best yield?' },
                userId: '123' as UUID,
                agentId: '123' as UUID,
                roomId: '123' as UUID
            };

            const state = { ...mockState };
            await getBestYieldAction.handler(mockRuntime, message, state, {}, mockCallback as HandlerCallback);

            // Should still show results for opt-sepolia
            const callbackArg = mockCallback.mock.calls[0][0];
            expect(callbackArg.text).toContain('opt-sepolia: 3.50%');
            expect(callbackArg.text).not.toContain('arb-sepolia');
        });
    });
});
