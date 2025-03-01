import { UiPoolDataProvider } from '@aave/contract-helpers';
import { formatReserves } from '@aave/math-utils';
import { TOKENS } from './addresses';
import { elizaLogger } from '@elizaos/core';
import { getProvider, NETWORKS } from './provider';

type Asset = 'USDC'

interface ReserveData {
    assetAddress: string;
    symbol: string;
    name: string;
    decimals: number;
    supplyAPY: number;
    userScaledATokenBalance?: bigint;
}

function isMatchingAsset(tokenAddress: string, network: string, asset: string): boolean {
    if (!tokenAddress || !TOKENS[network.toUpperCase()] || !TOKENS[network.toUpperCase()][asset]) {
        return false;
    }

    return tokenAddress.toLowerCase() === TOKENS[network.toUpperCase()][asset].toLowerCase();
}

export async function fetchAaveYieldData(network: string, asset: Asset, userAddress?: string): Promise<ReserveData[]> {
    const networkConfig = NETWORKS[network];

    if (!networkConfig) {
        throw new Error(`Unsupported network: ${network}`);
    }

    const provider = getProvider(network);

    if (!provider) {
        throw new Error(`Failed to create provider for network: ${network}`);
    }

    const poolDataProviderContract = new UiPoolDataProvider({
        uiPoolDataProviderAddress: networkConfig.aaveMarket.UI_POOL_DATA_PROVIDER,
        provider,
        chainId: networkConfig.chainId,
    });

    try {
        const reserves = await poolDataProviderContract.getReservesHumanized({
            lendingPoolAddressProvider: networkConfig.aaveMarket.POOL_ADDRESSES_PROVIDER
        });

        let userReserves: any = null;
        if (userAddress) {
            try {
                userReserves = await poolDataProviderContract.getUserReservesHumanized({
                    lendingPoolAddressProvider: networkConfig.aaveMarket.POOL_ADDRESSES_PROVIDER,
                    user: userAddress,
                });
            } catch (error) {
                elizaLogger.error(`Error fetching user reserves for ${network}:`, error);
            }
        }

        const reservesArray = reserves.reservesData as any[];
        const baseCurrencyData = reserves.baseCurrencyData;

        const currentTimestamp = Math.floor(Date.now() / 1000);

        const formattedPoolReserves = formatReserves({
            reserves: reservesArray,
            currentTimestamp,
            marketReferenceCurrencyDecimals: baseCurrencyData.marketReferenceCurrencyDecimals,
            marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
        });

        const result: ReserveData[] = [];

        for (const reserve of formattedPoolReserves) {
            try {
                // Check if this is our target asset using a more generic approach
                // Handle both exact match and case where we have partial data
                const isAsset = (reserve.symbol && reserve.symbol === asset) ||
                               (reserve.underlyingAsset && isMatchingAsset(reserve.underlyingAsset, network, asset));

                if (!isAsset) continue;

                // Handle the case where supplyAPY might be a string in fallback mode
                const supplyAPY = typeof reserve.supplyAPY === 'string'
                    ? parseFloat(reserve.supplyAPY)
                    : reserve.supplyAPY || 0;

                const reserveData: ReserveData = {
                    assetAddress: reserve.underlyingAsset,
                    symbol: reserve.symbol || asset,
                    name: reserve.name || asset,
                    decimals: reserve.decimals || 18,
                    supplyAPY
                };

                if (userAddress && userReserves) {
                    const userReserve = userReserves.userReserves.find(
                        (ur: any) => ur.underlyingAsset.toLowerCase() === reserve.underlyingAsset.toLowerCase()
                    );

                    if (userReserve && userReserve.scaledATokenBalance) {
                        reserveData.userScaledATokenBalance = BigInt(userReserve.scaledATokenBalance);
                    } else {
                        reserveData.userScaledATokenBalance = BigInt(0);
                    }
                }

                result.push(reserveData);
            } catch (error) {
                elizaLogger.error(`Error processing reserve data for ${reserve.symbol || 'unknown reserve'}:`, error);
            }
        }

        return result;
    } catch (error) {
        elizaLogger.error(`Error in fetchAaveYieldData for ${network}:`, error);
        throw error;
    }
}
