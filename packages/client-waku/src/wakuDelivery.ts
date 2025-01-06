import { WakuBase } from './base';
import { IAgentRuntime } from '@elizaos/core';
import { WakuConfig } from './environment';

/**
 * This is a simple plugin class that uses WakuBase to provide
 * send and receive functionality. Adjust as needed.
 */
export class WakuDelivery {
  private wakuBase: WakuBase;
  private wakuConfig: WakuConfig;
  private isInitialized = false;

  constructor(private runtime: IAgentRuntime, private config: WakuConfig) {
    this.wakuBase = new WakuBase(config);
    this.wakuConfig = config;
  }

  async init() {
    await this.wakuBase.init();
    await this.wakuBase.subscribe();

    // Just example usage: hooking the 'message' event
    this.wakuBase.on('message', (event) => {
      console.log('[WakuPlugin] Received message =>', event);
      // TODO: Forward to agent logic
    });

    this.isInitialized = true;
  }

  async send(message: string) {
    if (!this.isInitialized) {
      console.warn('[WakuPlugin] Not initialized. Call init() first.');
      return;
    }
    await this.wakuBase.sendMessage(message, this.wakuConfig.WAKU_CONTENT_TOPIC);
  }

  async stop() {
    await this.wakuBase.stop();
    this.isInitialized = false;
  }
}
