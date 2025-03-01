import { ethers } from 'ethers';
import { elizaLogger } from '@elizaos/core';
import * as markets from '@bgd-labs/aave-address-book';
import { ChainId } from '@aave/contract-helpers';

export interface NetworkConfig {
    aaveMarket: any;
    chainId: ChainId;
    rpcUrl: string;
}

export const NETWORK_RPC_URLS: Record<string, string> = {
  "ETHEREUM": `https://eth-mainnet.g.alchemy.com/v2/${process.env.CHROMA_ALCHEMY_API_KEY || ''}`,
  "ETH-SEPOLIA": `https://eth-sepolia.g.alchemy.com/v2/${process.env.CHROMA_ALCHEMY_API_KEY || ''}`,
  "BASE-SEPOLIA": `https://base-sepolia.g.alchemy.com/v2/${process.env.CHROMA_ALCHEMY_API_KEY || ''}`,
  "ARB-SEPOLIA": `https://arb-sepolia.g.alchemy.com/v2/${process.env.CHROMA_ALCHEMY_API_KEY || ''}`,
  "OPT-SEPOLIA": `https://opt-sepolia.g.alchemy.com/v2/${process.env.CHROMA_ALCHEMY_API_KEY || ''}`,
};

export const NETWORKS: Record<string, NetworkConfig> = {
    "opt-sepolia": {
        aaveMarket: markets.AaveV3OptimismSepolia,
        chainId: ChainId.optimism_sepolia,
        rpcUrl: NETWORK_RPC_URLS["OPT-SEPOLIA"]
    },
    "arb-sepolia": {
        aaveMarket: markets.AaveV3ArbitrumSepolia,
        chainId: ChainId.arbitrum_sepolia,
        rpcUrl: NETWORK_RPC_URLS["ARB-SEPOLIA"]
    },
};

export function getProvider(network: string): ethers.providers.JsonRpcProvider | null {
    const networkUpper = network.toUpperCase();
    const rpcUrl = NETWORK_RPC_URLS[networkUpper];

    if (!rpcUrl) {
        elizaLogger.error(`No RPC URL defined for network: ${network}`);
        return null;
    }

    return new ethers.providers.JsonRpcProvider(rpcUrl);
}
