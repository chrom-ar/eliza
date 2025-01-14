import { createClient } from 'redis';
import { Message, MessageCallback, MessageProvider, MessageProviderConfig } from '../types';

export class RedisMessageProvider implements MessageProvider {
  private client: ReturnType<typeof createClient> | null = null;
  private pubClient: ReturnType<typeof createClient> | null = null;
  private subClient: ReturnType<typeof createClient> | null = null;
  private config: MessageProviderConfig;
  private subscriptionMap: Map<string, {
    callback: MessageCallback;
    expiration: number;
  }> = new Map();
  private timer: NodeJS.Timeout | null = null;

  constructor(config: MessageProviderConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.client) {
      const url = this.config.redisUrl || 'redis://localhost:6379';

      // Main client for key-value operations
      this.client = createClient({ url });
      await this.client.connect();

      // Dedicated pub client
      this.pubClient = this.client.duplicate();
      await this.pubClient.connect();

      // Dedicated sub client
      this.subClient = this.client.duplicate();
      await this.subClient.connect();

      // Setup subscription handler
      this.subClient.on('message', async (channel, message) => {
        try {
          const parsedMessage = JSON.parse(message) as Message;
          const subscription = this.subscriptionMap.get(parsedMessage.roomId);

          if (subscription) {
            // Renew expiration
            subscription.expiration = Date.now() + (this.getExpirationSeconds() * 1000);
            await subscription.callback(parsedMessage);
          }
        } catch (err) {
          console.error('Error handling Redis message:', err);
        }
      });

      this.startSubscriptionCleaner();
      console.log('Redis clients connected.');
    }
  }

  async disconnect(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await Promise.all([
      this.client?.quit(),
      this.pubClient?.quit(),
      this.subClient?.quit()
    ]);

    this.client = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async publishToGeneral(message: Message): Promise<void> {
    if (!this.pubClient) throw new Error('Not connected');

    const channel = this.buildGeneralChannel();
    await this.pubClient.publish(channel, JSON.stringify(message));
    console.log(`Message published on general channel: ${channel}`);
  }

  async publishToRoom(message: Message): Promise<void> {
    if (!this.pubClient) throw new Error('Not connected');

    const channel = this.buildRoomChannel(message.roomId);
    await this.pubClient.publish(channel, JSON.stringify(message));
    console.log(`Message published on room channel: ${channel}`);
  }

  async subscribeToRoom(roomId: string, callback: MessageCallback, expirationSeconds?: number): Promise<void> {
    if (!this.subClient) throw new Error('Not connected');

    // If already subscribed, just renew expiration
    const existingSubscription = this.subscriptionMap.get(roomId);
    if (existingSubscription) {
      existingSubscription.expiration = Date.now() + ((expirationSeconds || this.getExpirationSeconds()) * 1000);
      return;
    }

    const channel = this.buildRoomChannel(roomId);
    await this.subClient.subscribe(channel, (message, channel) => {
      console.log('Received message:', message, 'on channel:', channel);
      if (callback && typeof callback === 'function') {
        callback({
          roomId,
          body: message,
          timestamp: Date.now()
        });
      }
    });

    this.subscriptionMap.set(roomId, {
      callback,
      expiration: Date.now() + ((expirationSeconds || this.getExpirationSeconds()) * 1000)
    });

    console.log(`Subscribed to roomId=${roomId} on channel=${channel}`);
  }

  async unsubscribeFromRoom(roomId: string): Promise<void> {
    if (!this.subClient) return;

    const channel = this.buildRoomChannel(roomId);
    await this.subClient.unsubscribe(channel);
    this.subscriptionMap.delete(roomId);
    console.log(`Unsubscribed from roomId=${roomId} on channel=${channel}`);
  }

  private buildGeneralChannel(): string {
    const prefix = this.config.redisKeyPrefix || 'chroma';
    const generalTopic = this.config.generalTopic || 'intents';
    return `${prefix}:${generalTopic}`;
  }

  private buildRoomChannel(roomId: string): string {
    const prefix = this.config.redisKeyPrefix || 'chroma';
    const roomPrefix = this.config.roomTopicPrefix || 'room';
    return `${prefix}:${roomPrefix}:${roomId}`;
  }

  private getExpirationSeconds(): number {
    return 600; // 10 minutes default
  }

  private startSubscriptionCleaner() {
    if (this.timer) return;

    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [roomId, subscription] of this.subscriptionMap.entries()) {
        if (subscription.expiration < now) {
          console.log(`Subscription for roomId=${roomId} expired. Unsubscribing...`);
          this.unsubscribeFromRoom(roomId).catch(err => {
            console.error(`Error cleaning up subscription for roomId=${roomId}:`, err);
          });
        }
      }
    }, 30_000);
  }
}