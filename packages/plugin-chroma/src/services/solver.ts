import { Service, ServiceType, IAgentRuntime, elizaLogger} from '@elizaos/core';
import WakuClientInterface from "@elizaos/client-waku";

import { buildResponse } from '../solver';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SolverService extends Service {
  private initialized = false;
  private runtime: IAgentRuntime;
  private interval: NodeJS.Timeout | null = null;
  // @ts-ignore
  private waku: any;

  private config: object;

  constructor() {
    super();
  }

  static get serviceType(): ServiceType {
    return "Solver" as ServiceType // ServiceType.WAKU_MESSAGING;
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    if (this.initialized) {
      return
    }

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

    // Empty string for default topic
    this.waku.subscribe('', async (event) => {
      const response = await buildResponse(event, this.config);

      if (!response) {
        elizaLogger.info(`[SolverService] No response for ${event.roomId}`);
        return;
      }

      elizaLogger.info(`[SolverService] Sending response to ${event.roomId}`, response);

      await sleep(500); // Sleep a little time to wait for the chat
      await this.waku.sendMessage(response, event.roomId, event.roomId);
    });

    elizaLogger.info('[SolverService] initialized');

    this.initialized = true;
  }
}
