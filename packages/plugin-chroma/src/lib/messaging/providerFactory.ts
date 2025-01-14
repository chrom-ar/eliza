import { MessageProvider, MessageProviderConfig } from './types';
import { WakuMessageProvider } from './providers/wakuProvider';
import { RedisMessageProvider } from './providers/redisProvider';

export class MessageProviderFactory {
  private static instance: MessageProvider | null = null;

  static async createProvider(config: MessageProviderConfig): Promise<MessageProvider> {
    if (MessageProviderFactory.instance) {
      return MessageProviderFactory.instance;
    }

    let provider: MessageProvider;

    switch (config.type) {
      case 'waku':
        provider = new WakuMessageProvider(config);
        break;
      case 'redis':
        provider = new RedisMessageProvider(config);
        break;
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }

    await provider.connect();
    MessageProviderFactory.instance = provider;
    return provider;
  }

  static async getProvider(): Promise<MessageProvider> {
    if (!MessageProviderFactory.instance) {
      throw new Error('Provider not initialized. Call createProvider first.');
    }
    return MessageProviderFactory.instance;
  }

  static async destroyProvider(): Promise<void> {
    if (MessageProviderFactory.instance) {
      await MessageProviderFactory.instance.disconnect();
      MessageProviderFactory.instance = null;
    }
  }
}