import { Service, ServiceType, IAgentRuntime } from '@elizaos/core';
import { MessageProviderFactory } from './providerFactory';
import { MessageProviderConfig } from './types';

// TODO: Temporary service to initialize the message provider
export class MessageService extends Service {
  constructor() {
    super();
  }

  static get serviceType(): ServiceType {
    return ServiceType.WAKU_MESSAGING_TMP;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    await MessageProviderFactory.createProvider(runtime);
  }
}
