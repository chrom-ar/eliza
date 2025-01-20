import { WakuBase } from './base';
import { IAgentRuntime, elizaLogger, Memory, stringToUuid, getEmbeddingZeroVector } from '@elizaos/core';
import { WakuConfig } from './environment';

// TODO: This class should be dropped in favor of the WakuBase class.
// Keeping it for now to avoid breaking changes.
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

    this.isInitialized = true;
  }

  async subscribe(topic: string, fn: any) {
    if (!this.isInitialized) {
      console.warn('[ClientWaku] Not initialized. Call init() first.');
      return;
    }

    await this.wakuBase.subscribe(topic, fn);
  }

  /**
   * Sends a message to the default content topic.
   * Also stored in memory, just like inbound messages.
   */
  async send(message: object, topic: string, roomId: string) {
    if (!this.isInitialized) {
      console.warn('[ClientWaku] Not initialized. Call init() first.');
      return;
    }

    await this.wakuBase.sendMessage(message, topic, roomId);
  }

  async stop() {
    await this.wakuBase.stop();
    this.isInitialized = false;
  }

  buildFullTopic(topic?: string): string {
    return this.wakuBase.buildFullTopic(topic);
  }
}
