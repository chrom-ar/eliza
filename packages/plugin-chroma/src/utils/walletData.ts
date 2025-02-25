import { IAgentRuntime, Memory } from '@elizaos/core';
import * as path from 'path';

export type WalletType = 'evm' | 'solana' | 'unknown';

export interface Wallet {
  address: string;
  chains: string[];
  default: boolean;
  canSign: boolean;
  walletId?: string;
}

const WALLETS_CACHE_KEY = 'wallets';

// Helper function to determine wallet type based on chains and address
export function getWalletType(wallet: Wallet): WalletType {
  if (wallet.address.toLowerCase().startsWith('0x')) {
    return 'evm';
  }

  const evmChainIdentifiers = ['eth', 'base', 'evm', 'polygon', 'arbitrum', 'optimism', 'sepolia'];
  const solanaChainIdentifiers = ['solana'];

  for (const chain of wallet.chains) {
    const chainLower = chain.toLowerCase();

    if (evmChainIdentifiers.some(id => chainLower.includes(id))) {
      return 'evm';
    } else if (solanaChainIdentifiers.some(id => chainLower.includes(id))) {
      return 'solana';
    }
  }

  return 'unknown';
}

export async function getAllWallets(runtime: IAgentRuntime, userId: string): Promise<Wallet[]> {
  const cacheKey = path.join(runtime.agentId, userId, WALLETS_CACHE_KEY);
  const wallets = await runtime.cacheManager.get<Wallet[]>(cacheKey);
  return wallets || [];
}

export async function getDefaultWallet(runtime: IAgentRuntime, userId: string): Promise<Wallet | null> {
  const wallets = await getAllWallets(runtime, userId);
  return wallets.find(wallet => wallet.default) || null;
}

export async function getWalletsByType(runtime: IAgentRuntime, userId: string, type: WalletType): Promise<Wallet[]> {
  const wallets = await getAllWallets(runtime, userId);
  return wallets.filter(wallet => getWalletType(wallet) === type);
}

export async function addWallet(
  runtime: IAgentRuntime,
  userId: string,
  walletData: { address: string; chains: string[]; canSign?: boolean; walletId?: string }
): Promise<Wallet> {
  const wallets = await getAllWallets(runtime, userId);
  const isFirst = wallets.length === 0;

  const newWallet: Wallet = {
    address: walletData.address,
    chains: walletData.chains,
    default: isFirst,
    canSign: !!walletData.canSign,
    walletId: walletData.walletId
  };

  wallets.push(newWallet);

  const cacheKey = path.join(runtime.agentId, userId, WALLETS_CACHE_KEY);
  await runtime.cacheManager.set(cacheKey, wallets);

  return newWallet;
}
