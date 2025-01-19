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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    console.log("Initializing waku with: ", wakuConfig)
  }

  async init() {
    const nodeConfig = {}
    const usePeers = this.wakuConfig.WAKU_STATIC_PEERS.length > 0;
    console.log("usePeers", usePeers)
    elizaLogger.info(`[MANSO] Connecting to static peers: ${usePeers}`);

    if (usePeers) {
      // NOTE: If other transports are needed we **have** to add them here
      nodeConfig['libp2p'] = { transports: [tcp()] }
    } else {
      nodeConfig['defaultBootstrap'] = true
    }

    this.wakuNode = await createLightNode(nodeConfig);

    if (usePeers) {
      const peers = this.wakuConfig.WAKU_STATIC_PEERS.split(',');
      console.log("Peers: ", peers)
      elizaLogger.info(`[WakuBase] Connecting to static peers: ${peers}`);

      for (let peer of peers) {
        for (let i = 0; i < 5; i++) {
          try {
            await this.wakuNode.dial(peer);
            elizaLogger.info(`[WakuBase] ${peer} connected`);
            break
          } catch (e) {
            elizaLogger.error(`[WakuBase] Error ${i} dialing peer ${peer}: ${e}`);
            await sleep(1000)
          }
        }
      }
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
        await sleep(1000)

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
  async subscribe(topic: string, fn: any): Promise<void> {
    if (!topic) {
      if (!this.wakuConfig.WAKU_CONTENT_TOPIC || !this.wakuConfig.WAKU_TOPIC) {
        throw new Error('[WakuBase] subscription not configured (missing env). No messages will be received.');
      }
    }

    this.subscribedTopic = this.buildFullTopic(topic);

    const { error, subscription } = await this.wakuNode.filter.createSubscription({
      // forceUseAllPeers: true,
      maxAttempts: 10,
      contentTopics: [this.subscribedTopic]
    });

    if (error) {
      throw new Error(`[WakuBase] Error creating subscription: ${error.toString()}`);
    }

    this.subscription = subscription;

    elizaLogger.info(`[WakuBase] Subscribed to topic: ${this.subscribedTopic}`);

    await subscription.subscribe(
      [createDecoder(this.subscribedTopic)],
      async (wakuMsg) => {
        if (!wakuMsg?.payload) {
          elizaLogger.error('[WakuBase] Received message with no payload');
          return;
        }

        try {
          const msgDecoded = ChatMessage.decode(wakuMsg.payload);

          const event: WakuMessageEvent = {
            // @ts-ignore
            body: JSON.parse(bytesToUtf8(msgDecoded.body)),
            // @ts-ignore
            timestamp: Number(msgDecoded.timestamp),
            // @ts-ignore
            roomId: bytesToUtf8(msgDecoded.roomId)
          };

          // this.emit('message', event);

          await fn(event);
        } catch (err) {
          elizaLogger.error('[WakuBase] Error decoding message payload:', err);
        }
      }
    );

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
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    elizaLogger.success(`[WakuBase] Subscribed to topic: ${this.subscribedTopic}`);
  }

  async sendMessage(body: object, topic: string, roomId: string): Promise<void> {
    topic = this.buildFullTopic(topic);
    elizaLogger.info(`[WakuBase] Sending message to topic ${topic} =>`, body);

    const protoMessage = ChatMessage.create({
      timestamp: Date.now(),
      body: utf8ToBytes(JSON.stringify(body)),
      roomId: utf8ToBytes(roomId)
    });

    try {
      await this.wakuNode.lightPush.send(
        createEncoder({ contentTopic: topic }),
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
