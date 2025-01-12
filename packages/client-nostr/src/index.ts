import { Client, elizaLogger, IAgentRuntime } from '@elizaos/core';
import { validateNostrConfig, NostrConfig } from './environment';
import { NostrDelivery } from './nostrDelivery';

class NostrManager {
  delivery: NostrDelivery;

  constructor(runtime: IAgentRuntime, nostrConfig: NostrConfig) {
    this.delivery = new NostrDelivery(runtime, nostrConfig);
  }
}

/**
 * Implement the main interface for the agent's plugin 'Client'.
 */
export const NostrClientInterface: Client = {
  async start(runtime: IAgentRuntime) {
    const nostrConfig: NostrConfig = await validateNostrConfig(runtime);

    // Create manager & plugin
    const manager = new NostrManager(runtime, nostrConfig);

    // Initialize plugin
    await manager.delivery.init();

    elizaLogger.log('Nostr client started');

    return manager;
  },

  async stop(_runtime: IAgentRuntime) {
    elizaLogger.warn('Nostr client does not support stopping yet');
  },
};

export default NostrClientInterface;
