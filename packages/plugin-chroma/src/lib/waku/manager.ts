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

interface ChatMessage {
  timestamp: number;
  body: Uint8Array;
  roomId: string;
}

export class WakuSubscriptionManager {
  private static _instance: WakuSubscriptionManager;
  private _node: LightNode | null = null;
  private subscriptionMap: Map<string, {
    unsubscribe?: () => void;
    expiration: number;
  }> = new Map();

  private timer: NodeJS.Timeout | null = null;

  // Simplified ChatMessage
  private ChatMessageProto = new protobuf.Type('ChatMessage')
    .add(new protobuf.Field('timestamp', 1, 'uint64'))
    .add(new protobuf.Field('body', 2, 'bytes'))
    .add(new protobuf.Field('roomId', 3, 'string'));

  private constructor() {
    // Singleton
  }

  public static getInstance(): WakuSubscriptionManager {
    if (!WakuSubscriptionManager._instance) {
      WakuSubscriptionManager._instance = new WakuSubscriptionManager();
    }
    return WakuSubscriptionManager._instance;
  }

  /**
   * Returns the Waku node, creating if necessary.
   */
  public async getNode(): Promise<LightNode> {
    if (!this._node) {
      this._node = await createLightNode({ defaultBootstrap: true });
      await this._node.start();

      // Wait for Filter & LightPush support
      for (let i = 0; i < 20; i++) {
        try {
          await waitForRemotePeer(this._node, [Protocols.Filter, Protocols.LightPush], 5000);
          if (this._node.isConnected()) break;
        } catch (err) {
          console.log('Error waiting for remote peer', i, err);
          await this.sleep(1000);
        }
      }
      console.log('Waku node connected.');

      // Start the subscription cleanup timer
      this.startSubscriptionCleaner();
    }
    return this._node;
  }

  /**
   * Publishes an intent to the "general" topic.
   * For example, /chroma/0.1/intents/proto
   */
  public async publishGeneralIntent(body: object, roomId: string) {
    const node = await this.getNode();
    const generalTopic = this.buildGeneralTopic();
    // Build a ChatMessage
    const protoMsg = this.ChatMessageProto.create({
      timestamp: Date.now(),
      roomId,
      body: utf8ToBytes(JSON.stringify(body))
    });

    try {
      await node.lightPush.send(
        createEncoder({ contentTopic: generalTopic }),
        { payload: this.ChatMessageProto.encode(protoMsg).finish() }
      );
      console.log(`Message published on general topic: ${generalTopic}`);
    } catch (err) {
      console.error('Error publishing general intent:', err);
      throw err;
    }
  }

  /**
   * Subscribes to a topic derived from roomId, triggers `callback` on new messages.
   */
  public async subscribeRoom(
    roomId: string,
    callback: (jsonBody: any) => void,
    expirationSeconds = 600
  ) {
    // If already subscribed, just renew expiration
    if (this.subscriptionMap.has(roomId)) {
      const entry = this.subscriptionMap.get(roomId);
      if (entry) {
        entry.expiration = Date.now() + expirationSeconds * 1000;
      }
      return;
    }

    const node = await this.getNode();
    const contentTopic = this.buildRoomTopic(roomId);

    // @ts-ignore
    const { error, subscription } = await node.filter.createSubscription({
      forceUseAllPeers: true,
      maxAttempts: 10,
      contentTopics: [contentTopic]
    });

    if (error) {
      console.error(`Error creating subscription for roomId=${roomId}`, error);
      throw error;
    }

    await subscription.subscribe([createDecoder(contentTopic)], async (wakuMessage) => {
      try {
        // @ts-ignore
        const decoded = this.ChatMessageProto.decode(wakuMessage.payload) as ChatMessage;
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
        callback(jsonBody);
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

  /**
   * Publish to the room-based topic after the "first" message was published to the general topic.
   */
  public async publishToRoom(roomId: string, body: object) {
    const node = await this.getNode();
    const contentTopic = this.buildRoomTopic(roomId);

    const protoMsg = this.ChatMessageProto.create({
      timestamp: Date.now(),
      roomId,
      body: utf8ToBytes(JSON.stringify(body))
    });

    try {
      await node.lightPush.send(
        createEncoder({ contentTopic }),
        { payload: this.ChatMessageProto.encode(protoMsg).finish() }
      );
      console.log(`Message published on room topic: ${contentTopic}`);
    } catch (err) {
      console.error('Error publishing to room:', err);
      throw err;
    }
  }

  // ------------- Helpers --------------

  private buildGeneralTopic(): string {
    const defaultTopic = '/chroma/0.1/PLACEHOLDER/proto';
    // This should be done using the runtime, but for now we'll just use the env variable
    const base = process.env.WAKU_CONTENT_TOPIC || defaultTopic;
    const generalName = process.env.WAKU_TOPIC || 'intents';
    // e.g. /chroma/0.1/intents/proto
    return base.replace('PLACEHOLDER', generalName);
  }

  private buildRoomTopic(roomId: string): string {
    // e.g. /chroma/0.1/<roomId>/proto
    const defaultTopic = '/chroma/0.1/PLACEHOLDER/proto';
    const base = process.env.WAKU_CONTENT_TOPIC || defaultTopic;
    return base.replace('PLACEHOLDER', roomId);
  }

  private startSubscriptionCleaner() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [roomId, entry] of this.subscriptionMap.entries()) {
        if (entry.expiration < now) {
          console.log(`Subscription for roomId=${roomId} expired. Unsubscribing...`);
          try {
            entry.unsubscribe?.();
          } catch (err) {
            console.error(`Error unsubscribing from roomId=${roomId}:`, err);
          }
          this.subscriptionMap.delete(roomId);
        }
      }
    }, 30_000);
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
