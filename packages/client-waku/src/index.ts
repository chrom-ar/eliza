import { Client, elizaLogger, IAgentRuntime } from '@elizaos/core';
import { validateWakuConfig, WakuConfig } from './environment';
import { WakuDelivery } from './wakuDelivery';

class WakuManager {
  delivery: WakuDelivery;

  constructor(runtime: IAgentRuntime, wakuConfig: WakuConfig) {
    this.delivery = new WakuDelivery(runtime, wakuConfig);
  }
}

/**
 * Implement the main interface for the agent's plugin 'Client'.
 */
export const WakuClientInterface: Client = {
  async start(runtime: IAgentRuntime) {
    const wakuConfig: WakuConfig = await validateWakuConfig(runtime);

    // Create manager & plugin
    const manager = new WakuManager(runtime, wakuConfig);

    // Initialize plugin
    await manager.delivery.init();

    elizaLogger.log('Waku client started');

    return manager;
  },

  async stop(_runtime: IAgentRuntime) {
    elizaLogger.warn('Waku client does not support stopping yet');
  },
};

export default WakuClientInterface;
