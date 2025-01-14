import { Service, ServiceType, IAgentRuntime } from '@elizaos/core';
import { MessageProviderFactory } from './providerFactory';
import { MessageProviderConfig } from './types';

export class MessageService extends Service {
  constructor() {
    super();
  }

  static get serviceType(): ServiceType {
    return ServiceType.WAKU_MESSAGING;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    // Initialize the message provider based on environment variables
    const config: MessageProviderConfig = {
      type: (process.env.MESSAGE_PROVIDER_TYPE || 'waku') as 'waku' | 'redis',

      // Common config
      generalTopic: process.env.MESSAGE_GENERAL_TOPIC,
      roomTopicPrefix: process.env.MESSAGE_ROOM_PREFIX,

      // Waku specific config
      wakuContentTopic: process.env.WAKU_CONTENT_TOPIC,
      wakuTopic: process.env.WAKU_TOPIC,

      // Redis specific config
      redisUrl: process.env.REDIS_URL,
      redisKeyPrefix: process.env.REDIS_KEY_PREFIX
    };

    await MessageProviderFactory.createProvider(config);
    console.log(`Message provider initialized: ${config.type}`);
  }
}