import { IAgentRuntime } from '@elizaos/core';
import { MessageProvider, MessageProviderConfig } from './types';

import { WakuClient } from "@elizaos/client-waku";
import WakuClientInterface from "@elizaos/client-waku";

// TODO: Temporal implementation. Will be replaced by the waku client
export class MessageProviderFactory {
  private static instance: any | null = null;

  static async createProvider(runtime: IAgentRuntime): Promise<MessageProvider> {
    if (MessageProviderFactory.instance) {
      return MessageProviderFactory.instance;
    }

    const provider = await WakuClientInterface.start(runtime);
    MessageProviderFactory.instance = provider;
    // @ts-ignore
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
