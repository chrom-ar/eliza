import { Client, elizaLogger, IAgentRuntime } from '@elizaos/core';
import { validateWakuConfig, WakuConfig } from './environment';
import { WakuDelivery } from './wakuDelivery';

// TODO: drop the abstract class for the base class
export class WakuClient {
  delivery: WakuDelivery;

  constructor(runtime: IAgentRuntime, wakuConfig: WakuConfig) {
    this.delivery = new WakuDelivery(runtime, wakuConfig);
  }

  async subscribe(topic: string, fn: any) { return await this.delivery.subscribe(topic, fn); }
  async send(message: object, topic: string, roomId: string) { return await this.delivery.send(message, topic, roomId); }
}

/**
 * Implement the main interface for the agent's plugin 'Client'.
 */
export const WakuClientInterface: Client = {
  async start(runtime: IAgentRuntime) {
    const wakuConfig: WakuConfig = await validateWakuConfig(runtime);

    // Create manager & plugin
    const client = new WakuClient(runtime, wakuConfig);

    // Initialize plugin
    await client.delivery.init();

    elizaLogger.log('Waku client started');

    return client;
  },

  async stop(_runtime: IAgentRuntime) {
    elizaLogger.warn('Waku client does not support stopping yet');
  },
};

export default WakuClientInterface;
