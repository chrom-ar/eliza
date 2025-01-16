import {
  createLightNode,
  waitForRemotePeer,
  createDecoder,
  createEncoder,
  bytesToUtf8,
  utf8ToBytes,
  Protocols
} from '@waku/sdk';
import { tcp } from '@libp2p/tcp';
import protobuf from 'protobufjs';
import { EventEmitter } from 'events';
import { WakuConfig } from './environment';
import { randomHexString } from './utils';
import { elizaLogger } from '@elizaos/core';

export const ChatMessage = new protobuf.Type('ChatMessage')
  .add(new protobuf.Field('timestamp', 1, 'uint64'))
  .add(new protobuf.Field('body', 2, 'bytes'))
  .add(new protobuf.Field('roomId', 3, 'bytes'));

export interface WakuMessageEvent {
  timestamp: number;
  body: any;
  roomId: string;
}

export class WakuBase extends EventEmitter {
  wakuConfig: WakuConfig;
  wakuNode: any; // This will be the LightNode
  subscribedTopic: string = '';
  subscription: any;

  constructor(wakuConfig: WakuConfig) {
    super();
    this.wakuConfig = wakuConfig;
  }

  async init() {
    const nodeConfig = {}
    const usePeers = this.wakuConfig.WAKU_STATIC_PEERS.length > 0;

    if (usePeers) {
      // NOTE: If other transports are needed we **have** to add them here
      nodeConfig['libp2p'] = { transports: [tcp()] }
    } else {
      nodeConfig['defaultBootstrap'] = true
    }

    this.wakuNode = await createLightNode(nodeConfig);

    if (usePeers) {
      const peers = this.wakuConfig.WAKU_STATIC_PEERS.split(',');
      elizaLogger.info(`[WakuBase] Connecting to static peers: ${peers}`);

      await Promise.all(
        peers.map(multiaddr => this.wakuNode.dial(multiaddr))
      )
    }

    await this.wakuNode.start();

    // Wait for remote peer. This is repeated up to WAKU_PING_COUNT times.
    for (let i = 0; i < this.wakuConfig.WAKU_PING_COUNT; i++) {
      try {
        await this.wakuNode.waitForPeers([Protocols.LightPush, Protocols.Filter], 5000);

        if (this.wakuNode.isConnected()) {
          break;
        }
      } catch (e) {
        elizaLogger.info(`[WakuBase] Attempt ${i + 1}/${this.wakuConfig.WAKU_PING_COUNT} => still waiting for peers`);

        if (i === this.wakuConfig.WAKU_PING_COUNT - 1) {
          throw new Error('[WakuBase] Could not find remote peer after max attempts');
        }
      }
    }

    elizaLogger.success('[WakuBase] Connected to Waku');
  }

  /**
   * Subscribe to the user-specified WAKU_CONTENT_TOPIC
   * If it contains the placeholder, we replace with the WAKU_TOPIC value, possibly with an appended random hex if so desired.
   */
  async subscribe(): Promise<void> {
    if (!this.wakuConfig.WAKU_CONTENT_TOPIC || !this.wakuConfig.WAKU_TOPIC) {
      elizaLogger.warn('[WakuBase] subscription not configured (missing env). No messages will be received.');
      return;
    }

    let actualTopic = this.wakuConfig.WAKU_CONTENT_TOPIC.replace('PLACEHOLDER', this.wakuConfig.WAKU_TOPIC);
    // Optionally append random if you want ephemeral uniqueness
    if (actualTopic.includes('random-hex')) {
      actualTopic = actualTopic.replace('random-hex', randomHexString(16));
    }

    this.subscribedTopic = actualTopic;
    const { error, subscription } = await this.wakuNode.filter.createSubscription({
      forceUseAllPeers: true,
      maxAttempts: 10,
      contentTopics: [actualTopic]
    });

    if (error) {
      throw new Error(`[WakuBase] Error creating subscription: ${error.toString()}`);
    }

    this.subscription = subscription;

    elizaLogger.info(`[WakuBase] Subscribed to topic: ${this.subscribedTopic}`);

    await subscription.subscribe([createDecoder(actualTopic)], async (wakuMsg) => {
      if (!wakuMsg?.payload) return;

      try {
        const msgDecoded = ChatMessage.decode(wakuMsg.payload);
        // @ts-ignore
        const text = bytesToUtf8(msgDecoded.body);

        const event: WakuMessageEvent = {
          // @ts-ignore
          timestamp: Number(msgDecoded.timestamp),
          body: text,
          // @ts-ignore
          roomId: msgDecoded.roomId
        };

        this.emit('message', event);
      } catch (err) {
        elizaLogger.error('[WakuBase] Error decoding message payload:', err);
      }
    });

    // Attempt a 'ping' to ensure it is up
    for (let i = 0; i < this.wakuConfig.WAKU_PING_COUNT; i++) {
      try {
        await subscription.ping();
        break;
      } catch (e) {
        if (e instanceof Error && e.message.includes('peer has no subscriptions')) {
          elizaLogger.warn('[WakuBase] Peer has no subs, retrying subscription...');
          return this.subscribe();
        }
        elizaLogger.warn(`[WakuBase] Subscription ping attempt ${i} error, retrying...`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    elizaLogger.success(`[WakuBase] Subscribed to topic: ${this.subscribedTopic}`);
  }

  async sendMessage(body: string, topic: string, roomId: string): Promise<void> {
    if (!topic) {
      elizaLogger.warn('[WakuBase] sendMessage => not configured (missing env).');
      return;
    }

    let actualTopic = topic.replace('PLACEHOLDER', this.wakuConfig.WAKU_TOPIC);
    if (actualTopic.includes('random-hex')) {
      actualTopic = actualTopic.replace('random-hex', randomHexString(16));
    }

    elizaLogger.info(`[WakuBase] Sending message to topic ${actualTopic} => ${body}`);

    const protoMessage = ChatMessage.create({
      timestamp: Date.now(),
      body: utf8ToBytes(body),
      roomId
    });

    try {
      await this.wakuNode.lightPush.send(
        createEncoder({ contentTopic: actualTopic }),
        { payload: ChatMessage.encode(protoMessage).finish() }
      );
      elizaLogger.success('[WakuBase] Message sent!');
    } catch (e) {
      elizaLogger.error('[WakuBase] Error sending message:', e);
    }
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      elizaLogger.info('[WakuBase] unsubscribing...');
      await this.subscription.unsubscribe();
    }
    if (this.wakuNode) {
      elizaLogger.info('[WakuBase] stopping node...');
      await this.wakuNode.stop();
    }
  }
}
