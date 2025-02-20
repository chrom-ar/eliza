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

export async function getStoredWallet(runtime: IAgentRuntime, roomId: string): Promise<WalletMemory | null> {
  const walletManager = new MemoryManager({
    runtime,
    tableName: 'wallets'
  });

  // @ts-ignore
  const [existingWallet] = await walletManager.getMemories({ roomId, count: 1 });

  if (!existingWallet) {
    return null;
  }

  return {
    walletId: existingWallet.content.walletId as string,
    address: existingWallet.content.address as string,
    network: existingWallet.content.network as string
  };
}

export async function storeWallet(runtime: IAgentRuntime, memory: Memory, walletData: WalletMemory): Promise<void> {
  const walletManager = new MemoryManager({
    runtime,
    tableName: 'wallets'
  });

  const newMemory: Memory = await walletManager.addEmbeddingToMemory({
    userId: memory.userId,
    agentId: memory.agentId,
    roomId: memory.roomId,
    createdAt: Date.now(),
    unique: true,
    content: {
      text: `Wallet data:\nAddress: ${walletData.address}\nNetwork: ${walletData.network}`,
      walletId: walletData.walletId,
      address: walletData.address,
      network: walletData.network
    }
  });

  await walletManager.createMemory(newMemory);
}

export function categorizeAddresses(addresses: string): { evmAddresses: string[], solanaAddresses: string[] } {
  const addressList = addresses.split(',').map(addr => addr.trim());
  return {
    evmAddresses: addressList.filter(addr => addr.toLowerCase().startsWith('0x')),
    solanaAddresses: addressList.filter(addr => !addr.toLowerCase().startsWith('0x'))
  };
}