import {
  createLightNode,
  createDecoder,
  createEncoder,
  bytesToUtf8,
  utf8ToBytes,
  Protocols,
  LightNode,
  HealthStatusChangeEvents,
} from '@waku/sdk';
import { createEncoder as createEciesEncoder, createDecoder as createEciesDecoder } from "@waku/message-encryption/ecies";
import { hexToBytes } from "@waku/utils/bytes";
import { tcp } from '@libp2p/tcp';
import protobuf from 'protobufjs';
import { EventEmitter } from 'events';
import { WakuConfig } from './environment';
import { randomHexString, sleep } from './utils';

import { privateKeyToAccount, Account } from "viem/accounts";

import { elizaLogger } from '@elizaos/core';

export const ChatMessage = new protobuf.Type('ChatMessage')
  .add(new protobuf.Field('timestamp', 1, 'uint64'))
  .add(new protobuf.Field('body', 2, 'bytes'))
  .add(new protobuf.Field('replyTo', 3, 'bytes'));

export interface WakuMessageEvent {
  timestamp: number;
  body: any;
  replyTo: string;
}

export class WakuClient extends EventEmitter {
  wakuConfig: WakuConfig;
  wakuNode: LightNode; // This will be the LightNode
  private subscriptionMap: Map<string, {
    subscription: any;
    expiration: number;
  }> = new Map();
  private topicNetworkConfig: {
    clusterId: string;
    shard: string;
  } | null = null;
  // private timer: NodeJS.Timeout | null = null;
  private privateKey: Uint8Array | null = null;
  public publicKey: string | null = null;

  constructor(wakuConfig: WakuConfig) {
    super();
    this.wakuConfig = wakuConfig;

    if (this.wakuConfig.WAKU_STATIC_CLUSTER_ID >= 0) {
      this.topicNetworkConfig = {
        clusterId: this.wakuConfig.WAKU_STATIC_CLUSTER_ID,
        shard: this.wakuConfig.WAKU_STATIC_SHARD,
      }
    }

    console.log('this.wakuConfig.WAKU_ENCRYPTION_PRIVATE_KEY', this.wakuConfig.WAKU_ENCRYPTION_PRIVATE_KEY);
    if (this.wakuConfig.WAKU_ENCRYPTION_PRIVATE_KEY) {
      this.privateKey = hexToBytes(this.wakuConfig.WAKU_ENCRYPTION_PRIVATE_KEY);
      console.log('this.privateKey', this.privateKey);
      this.publicKey = privateKeyToAccount(this.wakuConfig.WAKU_ENCRYPTION_PRIVATE_KEY).publicKey; 
    }
  }

  async init() {
    const peers = this.wakuConfig.WAKU_STATIC_PEERS.split(',');

    if (peers.length > 0) {
      // NOTE: If other transports are needed we **have** to add them here
      const nodeOpts = {
        libp2p: { transports: [tcp()] },
      }
      if (this.wakuConfig.WAKU_STATIC_CLUSTER_ID >= 0) {
        nodeOpts['networkConfig'] = {
          clusterId: this.wakuConfig.WAKU_STATIC_CLUSTER_ID,
          shards: [this.wakuConfig.WAKU_STATIC_SHARD],
        }
      }
      this.wakuNode = await createLightNode(nodeOpts);

      const peersDial = []
      for (let peer of peers) {
        // Dial fails sometimes
        peersDial.push((async () => {
          for (let i = 0; i < 5; i++) {
            try {
              await this.wakuNode.dial(peer);
              elizaLogger.info(`[WakuBase] ${peer} connected`);
              break
            } catch (e) {
              elizaLogger.error(`[WakuBase] Error ${i} dialing peer ${peer}: ${e}`);
              await sleep(500)
            }
          }
        }).bind(this)())
      }
      await Promise.all(peersDial)
    } else {
      this.wakuNode = await createLightNode({ defaultBootstrap: true });
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

        await sleep(500);
      }
    }

    this.wakuNode.health.addEventListener(HealthStatusChangeEvents.StatusChange, (event: any) => {
      elizaLogger.info(`Health status changed to: ${event.detail}`);
    });

    elizaLogger.success('[WakuBase] Connected to Waku');
  }

  /**
   * Subscribe to the user-specified WAKU_CONTENT_TOPIC
   * If it contains the placeholder, we replace with the WAKU_TOPIC value, possibly with an appended random hex if so desired.
   */
  async subscribe(topic: string, fn: any, opts = { expirationSeconds: 20, encrypted: false }): Promise<void> {
    if (!topic) {
      if (!this.wakuConfig.WAKU_CONTENT_TOPIC || !this.wakuConfig.WAKU_TOPIC) {
        throw new Error('[WakuBase] subscription not configured (missing env). No messages will be received.');
      }
    }

    console.log('opts', opts, this.privateKey, this.publicKey);
    if (opts.encrypted && !this.privateKey) {
      throw new Error('[WakuBase] Encryption is enabled but no private key is set');
    }

    const subscribedTopic = this.buildFullTopic(topic);

    let decoder;
    if (opts.encrypted) {
      decoder = createEciesDecoder(subscribedTopic, this.privateKey, this.topicNetworkConfig);
    } else {
      decoder = createDecoder(subscribedTopic, this.topicNetworkConfig);
    }

    // @ts-ignore
    const subResult = await this.wakuNode.filter.subscribe([decoder], async (wakuMsg) => {
        if (!wakuMsg?.payload) {
          elizaLogger.error('[WakuBase] Received message with no payload');
          return;
        }

        let msgDecoded: any;

        try {
          msgDecoded = ChatMessage.decode(wakuMsg.payload);

          const event: WakuMessageEvent = {
            // @ts-ignore
            body: JSON.parse(bytesToUtf8(msgDecoded.body)),
            // @ts-ignore
            timestamp: Number(msgDecoded.timestamp),
            // @ts-ignore
            replyTo: bytesToUtf8(msgDecoded.replyTo)
          };

          await fn(event);
        } catch (err) {
          elizaLogger.error('[WakuBase] Error decoding message payload:', err, msgDecoded);
        }
      }
    );

    if (subResult.error) {
      throw new Error(`[WakuBase] Error creating subscription: ${subResult.error.toString()}`);
    }

    const subscription = subResult.subscription;

    // Attempt a 'ping' to ensure it is up
    for (let i = 0; i < this.wakuConfig.WAKU_PING_COUNT; i++) {
      try {
        await subscription.ping();
        break;
      } catch (e) {
        if (e instanceof Error && e.message.includes('peer has no subscriptions')) {
          elizaLogger.warn('[WakuBase] Peer has no subs, retrying subscription...');
          return this.subscribe(topic, fn);
        }
        elizaLogger.warn(`[WakuBase] Subscription ping attempt ${i} error, retrying...`);

        await sleep(500);
      }
    }

    elizaLogger.success(`[WakuBase] Subscribed to topic: ${subscribedTopic}`);

    // Save subscription to check expiration
    this.subscriptionMap.set(subscribedTopic, {
      subscription: subscription,
      expiration: Date.now() + opts.expirationSeconds * 1000
    });
  }

  async sendMessage(body: object, topic: string, replyTo: string, encryptionPubKey?: string): Promise<void> {
    topic = this.buildFullTopic(topic);
    elizaLogger.info(`[WakuBase] Sending message to topic ${topic} =>`, body);

    const protoMessage = ChatMessage.create({
      timestamp: Date.now(),
      replyTo:    utf8ToBytes(replyTo),
      body:      utf8ToBytes(JSON.stringify({...body, signerPubKey: this.publicKey})),
    });

    let encoder;
    if (encryptionPubKey) {
      encoder = createEciesEncoder({
        contentTopic: topic,
        publicKey: encryptionPubKey,
        pubsubTopicShardInfo: this.topicNetworkConfig,
        ephemeral: true,
      });
    } else {
      encoder = createEncoder({ contentTopic: topic, pubsubTopicShardInfo: this.topicNetworkConfig, ephemeral: true });
    }

    try {
      await this.wakuNode.lightPush.send(
        encoder,
        { payload: ChatMessage.encode(protoMessage).finish() }
      );
      elizaLogger.success('[WakuBase] Message sent!');
    } catch (e) {
      elizaLogger.error('[WakuBase] Error sending message:', e);
    }
  }

  async unsubscribe(topic: string): Promise<void> {
    if (this.wakuNode) {
      const subscribedTopic = this.buildFullTopic(topic);
      const subscription = this.subscriptionMap.get(subscribedTopic);

      if (subscription) {
        elizaLogger.info(`[WakuBase] Unsubscribing from topic: ${subscribedTopic}`);
        await subscription.subscription.unsubscribe();
        this.subscriptionMap.delete(subscribedTopic);
      } else {
        elizaLogger.warn(`[WakuBase] No subscription found for topic: ${subscribedTopic}`);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.wakuNode) {
      elizaLogger.info('[WakuBase] stopping node...');
      await this.wakuNode.stop();
    }
  }

  defaultIntentsTopic(): string {
    return this.wakuConfig.WAKU_CONTENT_TOPIC.replace('PLACEHOLDER', this.wakuConfig.WAKU_TOPIC);
  }

  buildFullTopic(topic?: string): string {
    if (!topic) {
      return this.defaultIntentsTopic()
    } else if (topic.includes('random')) {
      // Optionally append random if you want ephemeral uniqueness
      return this.wakuConfig.WAKU_CONTENT_TOPIC.replace('PLACEHOLDER', randomHexString(16));
    } else if (!topic.startsWith('/')) { // partial topic
      return this.wakuConfig.WAKU_CONTENT_TOPIC.replace('PLACEHOLDER', topic);
    }

    return topic;
  }
}
