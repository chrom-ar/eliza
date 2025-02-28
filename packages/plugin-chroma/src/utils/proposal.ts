import { IAgentRuntime } from '@elizaos/core';
import * as path from 'path';

export const PROPOSAL_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

export interface Proposal {
  number: number;
  transactions: any[];
  titles: string[];
  description?: string;
  calls?: string[];
  simulation?: any;
}

export interface ProposalData {
  proposals: Proposal[];
  createdAt: number;
}

export function getProposalCacheKey(runtime: IAgentRuntime, userId: string, roomId: string): string {
  return path.join(runtime.agentId, userId, roomId, 'proposals');
}

export async function storeProposals(runtime: IAgentRuntime, userId: string, roomId: string, data: ProposalData): Promise<void> {
  const cacheKey = getProposalCacheKey(runtime, userId, roomId);
  await runtime.cacheManager.set(cacheKey, data);
}

export async function getProposals(runtime: IAgentRuntime, userId: string, roomId: string): Promise<ProposalData | null> {
  const cacheKey = getProposalCacheKey(runtime, userId, roomId);
  const data = await runtime.cacheManager.get<ProposalData>(cacheKey);

  if (!data) {
    return null;
  }

  // Check expiration
  if (Date.now() - data.createdAt > PROPOSAL_EXPIRATION_MS) {
    await runtime.cacheManager.delete(cacheKey);
    return null;
  }

  return data;
}

export async function deleteProposals(runtime: IAgentRuntime, userId: string, roomId: string): Promise<void> {
  const cacheKey = getProposalCacheKey(runtime, userId, roomId);
  await runtime.cacheManager.delete(cacheKey);
}

export function formatProposalText(proposal: Proposal): object {
  const title = `Proposal #${proposal.number}: ${proposal.description}.\nActions:\n`;
  const actions = []

  for (let index in proposal.calls || []) {
    actions.push(`${parseInt(index) + 1}) ${proposal.calls[index]}\n`);
  }

  return { title, actions };
}
