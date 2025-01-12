import { EventEmitter } from 'events';
import { NostrConfig } from './environment';
import { elizaLogger } from '@elizaos/core';

import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'
import { finalizeEvent } from 'nostr-tools/pure'
import { Relay } from "nostr-tools/relay";

export class NostrBase extends EventEmitter {
  nostrConfig: NostrConfig;
  nostrRelay: any;
  subscribedTopic: string = '';
  subscription: any;

  constructor(nostrConfig: NostrConfig) {
    super();
    useWebSocketImplementation(WebSocket);

    this.nostrConfig = nostrConfig;
  }

  async init() {
    this.nostrRelay = await Relay.connect(this.nostrConfig.NOSTR_RELAY_WSS)

    elizaLogger.success('[NostrBase] Connected to Nostr');
  }

  private createTopic(topic: string): string {
    return this.nostrConfig.NOSTR_CONTENT_TOPIC.replace('PLACEHOLDER', topic);
  }

  /**
   * Subscribe to the user-specified NOSTR_CONTENT_TOPIC
   * If it contains the placeholder, we replace with the NOSTR_TOPIC value, possibly with an appended random hex if so desired.
   */
  async subscribe(callback: any, topic?: string): Promise<void> {
    if (!this.nostrRelay) {
      elizaLogger.warn('[NostrBase] subscription not configured yes. Need to call init() first.');
      return;
    }

    if (!this.nostrConfig.NOSTR_CONTENT_TOPIC || !this.nostrConfig.NOSTR_TOPIC) {
      elizaLogger.warn('[NostrBase] subscription not configured (missing env). No messages will be received.');
      return;
    }

    this.subscribedTopic = this.createTopic(topic || this.nostrConfig.NOSTR_TOPIC)

    this.subscription = this.nostrRelay.subscribe([
      {
        kinds: [1],
        '#t': [this.subscribedTopic],
        since: Math.floor(Date.now() / 1000) - 10, // 10 seconds ago
      },
    ], {
      onevent(event) {
        if (callback) callback(event);

        this.emit('message', event);
      }
    })

    elizaLogger.info(`[NostrBase] Subscribed to topic: ${this.subscribedTopic}`);
  }

  async sendMessage(body: string, topic: string, roomId: string, secretKey: Uint8Array): Promise<void> {
    if (!this.nostrRelay) {
      elizaLogger.warn('[NostrBase] subscription not configured yes. Need to call init() first.');
      return;
    }

    if (!topic) {
      elizaLogger.warn('[NostrBase] sendMessage => needs a topic.');
      return;
    }

    const currentTopic = this.createTopic(topic)

    elizaLogger.info(`[NostrBase] Sending message to topic ${currentTopic} => ${body}`);

    const event = {
      kind: 1,
      content: JSON.stringify({body, roomId}),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', currentTopic]]
    }

    const signedEvent = finalizeEvent(event, secretKey);

    try {
      this.nostrRelay.publish(signedEvent);
      elizaLogger.success('[NostrBase] Message sent!');
    } catch (e) {
      elizaLogger.error('[NostrBase] Error sending message:', e);
    }
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      elizaLogger.info('[NostrBase] unsubscribing...');
      await this.subscription.close();
    }
    if (this.nostrRelay) {
      elizaLogger.info('[NostrBase] stopping node...');
      await this.nostrRelay.close();
    }
  }
}
