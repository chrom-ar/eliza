import { IAgentRuntime } from '@elizaos/core';
import { MessageProvider, MessageProviderConfig } from './types';
// import { WakuMessageProvider } from './providers/wakuProvider';
// import { RedisMessageProvider } from './providers/redisProvider';
import { WakuClient } from "@elizaos/client-waku";
import WakuClientInterface from "@elizaos/client-waku";

export class MessageProviderFactory {
  private static instance: any | null = null;

  static async createProvider(runtime: IAgentRuntime): Promise<MessageProvider> {
    if (MessageProviderFactory.instance) {
      return MessageProviderFactory.instance;
    }

    // let provider: MessageProvider;

    // switch (config.type) {
    //   case 'waku':
    //     provider = new WakuMessageProvider(config);
    //     break;
    //   case 'redis':
    //     provider = new RedisMessageProvider(config);
    //     break;
    //   default:
    //     throw new Error(`Unsupported provider type: ${config.type}`);
    // }

    const provider = await WakuClientInterface.start(runtime);
    MessageProviderFactory.instance = provider;
    return provider;
  }

  static getProvider(): any {
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
