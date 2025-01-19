import { Service, ServiceType, IAgentRuntime, elizaLogger} from '@elizaos/core';
import { WakuClient } from "@elizaos/client-waku";
import WakuClientInterface from "@elizaos/client-waku";

import { buildResponse } from '../solver';
import { privateKeyToAccount } from 'viem/accounts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SolverService extends Service {
  private runtime: IAgentRuntime;
  private interval: NodeJS.Timeout | null = null;
  // @ts-ignore
  private waku: WakuClient;

  private config: object;

  constructor() {
    super();
  }

  static get serviceType(): ServiceType {
    return ServiceType.WAKU_MESSAGING;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    // TMP
    this.config = {
      PRIVATE_KEY: (() => {
        const key = this.runtime.getSetting('SOLVER_PRIVATE_KEY');

        if (!key) throw new Error('PRIVATE_KEY is not set in the environment variables.');

        return key;
      })()
    }

    // @ts-ignore
    this.waku = await WakuClientInterface.start(runtime);

    elizaLogger.info('MANSO SolverService initialized E');
    console.log('MANSO SolverService initialized c');

    this.waku.subscribe('', async (event) => {
      console.log('MANSO-C SolverService event received', event);
      elizaLogger.info('MANSO-E SolverService event received', event);

      const response = await buildResponse(event, this.config);
      console.log('MANSO-C SolverService response', response);
      elizaLogger.info('MANSO-E SolverService response', response);

      await sleep(10000); // Sleep a little time to wait for the chat
      await this.waku.send(response, event.roomId, event.roomId);
    }); // Empty string for default topic
  }
}
