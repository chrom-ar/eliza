import protobuf from 'protobufjs';
import {
  createLightNode,
  waitForRemotePeer,
  createDecoder,
  createEncoder,
  bytesToUtf8,
  utf8ToBytes,
  Protocols,
  LightNode
} from '@waku/sdk';
import { tcp} from '@libp2p/tcp';
import { Message, MessageCallback, MessageProvider, MessageProviderConfig } from '../types';

export class WakuMessageProvider implements MessageProvider {
  private node: LightNode | null = null;
  private subscriptionMap: Map<string, {
    unsubscribe?: () => void;
    expiration: number;
  }> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private config: MessageProviderConfig;

  private ChatMessageProto = new protobuf.Type('ChatMessage')
    .add(new protobuf.Field('timestamp', 1, 'uint64'))
    .add(new protobuf.Field('body', 2, 'bytes'))
    .add(new protobuf.Field('roomId', 3, 'string'));

  constructor(config: MessageProviderConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.node) {
      this.node = await createLightNode({
        // @ts-ignore
        libp2p: { transports: [tcp()] }
      });
      for (let i = 0; i < 5; i++) {
        try {
          await this.node.dial(
            "/ip4/52.22.92.109/tcp/30304/p2p/16Uiu2HAkuuNT9a6qbMDh3scEEegGEcKTDnYp7iaT6oHUrBzEKT5r"
          )
        } catch (err) {
          console.error('Error dialing Waku node:', err);
          await this.sleep(1000);
        }
      }
      await this.node.start();

      // Wait for Filter & LightPush support
      for (let i = 0; i < 20; i++) {
        try {
          await waitForRemotePeer(this.node, [Protocols.Filter, Protocols.LightPush], 5000);
          if (this.node.isConnected()) break;
        } catch (err) {
          console.log('Error waiting for remote peer', i, err);
          await this.sleep(1000);
        }
      }
      console.log('Waku node connected.');
      this.startSubscriptionCleaner();
    }
  }

  async disconnect(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async publishToGeneral(message: Message): Promise<void> {
    if (!this.node) throw new Error('Not connected');

    const generalTopic = this.buildGeneralTopic();
    const protoMsg = this.ChatMessageProto.create({
      timestamp: message.timestamp,
      roomId: message.roomId,
      body: utf8ToBytes(JSON.stringify(message.body))
    });

    try {
      await this.node.lightPush.send(
        createEncoder({ contentTopic: generalTopic }),
        { payload: this.ChatMessageProto.encode(protoMsg).finish() }
      );
      console.log(`Message published on general topic: ${generalTopic}`);
    } catch (err) {
      console.error('Error publishing general message:', err);
      throw err;
    }
  }

  async publishToRoom(message: Message): Promise<void> {
    if (!this.node) throw new Error('Not connected');

    const contentTopic = this.buildRoomTopic(message.roomId);
    const protoMsg = this.ChatMessageProto.create({
      timestamp: message.timestamp,
      roomId: message.roomId,
      body: utf8ToBytes(JSON.stringify(message.body))
    });

    try {
      await this.node.lightPush.send(
        createEncoder({ contentTopic }),
        { payload: this.ChatMessageProto.encode(protoMsg).finish() }
      );
      console.log(`Message published on room topic: ${contentTopic}`);
    } catch (err) {
      console.error('Error publishing to room:', err);
      throw err;
    }
  }

  async subscribeToRoom(roomId: string, callback: MessageCallback, expirationSeconds = 600): Promise<void> {
    if (!this.node) throw new Error('Not connected');

    console.log('wakuProvider.ts:109');
    // If already subscribed, just renew expiration
    if (this.subscriptionMap.has(roomId)) {
      const entry = this.subscriptionMap.get(roomId);
      if (entry) {
        entry.expiration = Date.now() + expirationSeconds * 1000;
      }
      console.log('wakuProvider.ts:116');
      return;
    }

    console.log('wakuProvider.ts:120');
    const contentTopic = this.buildRoomTopic(roomId);

    // @ts-ignore
    const { error, subscription } = await this.node.filter.createSubscription({
      forceUseAllPeers: true,
      maxAttempts: 10,
      contentTopics: [contentTopic]
    });

    console.log('wakuProvider.ts:130');
    if (error) {
      console.error(`Error creating subscription for roomId=${roomId}`, error);
      throw error;
    }

    console.log('wakuProvider.ts:136');
    await subscription.subscribe([createDecoder(contentTopic)], async (wakuMessage) => {
      try {
        // @ts-ignore
        const decoded = this.ChatMessageProto.decode(wakuMessage.payload) as Message;
        // Renew expiration
        const subEntry = this.subscriptionMap.get(roomId);
        if (subEntry) {
          subEntry.expiration = Date.now() + expirationSeconds * 1000;
        }

        // Convert body => JSON
        const bodyStr = bytesToUtf8(decoded.body);
        let jsonBody: any;
        try {
          jsonBody = JSON.parse(bodyStr);
        } catch (err) {
          console.error('Invalid JSON in ChatMessage body:', err);
          return;
        }

        console.log('wakuProvider.ts:157');
        await callback({
          timestamp: decoded.timestamp,
          roomId: decoded.roomId,
          body: jsonBody
        });
      } catch (err) {
        console.error('Error decoding Waku message:', err);
      }
    });

    // Track the subscription in the manager
    this.subscriptionMap.set(roomId, {
      unsubscribe: () => subscription.unsubscribe(),
      expiration: Date.now() + expirationSeconds * 1000
    });

    console.log(`Subscribed to roomId=${roomId} on topic=${contentTopic}`);
  }

  async unsubscribeFromRoom(roomId: string): Promise<void> {
    const entry = this.subscriptionMap.get(roomId);
    if (entry) {
      try {
        entry.unsubscribe?.();
      } catch (err) {
        console.error(`Error unsubscribing from roomId=${roomId}:`, err);
      }
      this.subscriptionMap.delete(roomId);
    }
  }

  private buildGeneralTopic(): string {
    const defaultTopic = '/chroma/0.1/PLACEHOLDER/proto';
    const base = this.config.wakuContentTopic || defaultTopic;
    const generalName = this.config.wakuTopic || 'intents';
    return base.replace('PLACEHOLDER', generalName);
  }

  private buildRoomTopic(roomId: string): string {
    const defaultTopic = '/chroma/0.1/PLACEHOLDER/proto';
    const base = this.config.wakuContentTopic || defaultTopic;
    return base.replace('PLACEHOLDER', roomId);
  }

  private startSubscriptionCleaner() {
    if (this.timer) return;

    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [roomId, entry] of this.subscriptionMap.entries()) {
        if (entry.expiration < now) {
          console.log(`Subscription for roomId=${roomId} expired. Unsubscribing...`);
          this.unsubscribeFromRoom(roomId).catch(err => {
            console.error(`Error cleaning up subscription for roomId=${roomId}:`, err);
          });
        }
      }
    }, 30_000);
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
