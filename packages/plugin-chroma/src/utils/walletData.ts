import { IAgentRuntime, Memory, MemoryManager } from '@elizaos/core';
import * as path from 'path';

export interface WalletData {
  addresses?: string;
  chains?: string;
}

export interface WalletMemory {
  walletId: string;
  address: string;
  network: string;
}

export async function getWalletCache(runtime: IAgentRuntime, userId: string): Promise<WalletData> {
  const cacheKey = path.join(runtime.agentId, userId, 'blockchain-data');
  const cacheObj = await runtime.cacheManager.get<WalletData>(cacheKey);
  return cacheObj || { addresses: undefined, chains: undefined };
}

export async function setWalletCache(runtime: IAgentRuntime, userId: string, data: WalletData): Promise<void> {
  const cacheKey = path.join(runtime.agentId, userId, 'blockchain-data');
  await runtime.cacheManager.set(cacheKey, data);
}

export async function getStoredWallet(runtime: IAgentRuntime, userId: string): Promise<WalletMemory | null> {
  const cacheKey = path.join(runtime.agentId, userId, 'wallet-data');
  const walletData = await runtime.cacheManager.get<WalletMemory>(cacheKey);
  return walletData || null;
}

export async function storeWallet(runtime: IAgentRuntime, memory: Memory, walletData: WalletMemory): Promise<void> {
  const cacheKey = path.join(runtime.agentId, memory.userId, 'wallet-data');
  await runtime.cacheManager.set(cacheKey, walletData);
}

export function categorizeAddresses(addresses: string): { evmAddresses: string[], solanaAddresses: string[] } {
  const addressList = addresses.split(',').map(addr => addr.trim());
  return {
    evmAddresses: addressList.filter(addr => addr.toLowerCase().startsWith('0x')),
    solanaAddresses: addressList.filter(addr => !addr.toLowerCase().startsWith('0x'))
  };
}