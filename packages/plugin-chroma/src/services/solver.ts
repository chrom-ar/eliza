import { Service, ServiceType, IAgentRuntime, elizaLogger} from '@elizaos/core';
import WakuClientInterface from "@elizaos/client-waku";

import { AVAILABLE_TYPES, buildResponse, signPayload } from '../solver';

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
    if (runtime.getSetting('SKIP_SOLVER')) {
      return;
    }

    if (this.initialized) {
      return
    }

    this.runtime = runtime;

    // TMP
    this.config = {
      PRIVATE_KEY: (() => {
        const key = this.runtime.getSetting('SOLVER_PRIVATE_KEY');

        if (!key) throw new Error('PRIVATE_KEY is not set in the environment variables.');

        // If waku encryption is enabled for confidential messages, the private key must be the same, to keep correlation in staking
        if (this.runtime.getSetting('WAKU_ENCRYPTION_PRIVATE_KEY') && this.runtime.getSetting('WAKU_ENCRYPTION_PRIVATE_KEY') != key) {
          throw new Error('SOLVER_PRIVATE_KEY and WAKU_ENCRYPTION_PRIVATE_KEY MUST be the same.');
        }

        return key;
      })()
    }

    // @ts-ignore
    this.waku = await WakuClientInterface.start(runtime);

    // Empty string for default topic
    this.waku.subscribe('', async (event) => {
      const response = await buildResponse(event, this.config);

      if (!response) {
        elizaLogger.info(`[SolverService] No response for ${event.replyTo}`);
        return;
      }

      elizaLogger.info(`[SolverService] Sending response to ${event.replyTo}`, response);

      await sleep(500); // Sleep a little time to wait for the chat
      await this.waku.sendMessage(response, event.replyTo, event.replyTo);
    });

    // Handshake topic for confidential messages
    this.waku.subscribe('handshake', async (event) => {
      const { body: { type} } = event;

      if (AVAILABLE_TYPES.includes(type?.toUpperCase())) {
        elizaLogger.info(`[SolverService] Received ${type}-handshake for ${event.replyTo}`);
      } else {
        elizaLogger.info(`[SolverService] Received unknown ${type}-handshake for ${event.replyTo}`);
        return
      }

      // Just send an ack to init communication
      const { signer, signature } = await signPayload({}, this.config);
      const body = { signer, signature, signerPubKey: this.waku.publicKey };
      await this.waku.sendMessage(body, event.body.replyTo, this.waku.publicKey);
    });

    this.waku.subscribe(this.waku.publicKey, async (event) => {
      const response = await buildResponse(event, this.config);

      if (!response) {
        elizaLogger.info(`[SolverService] No response for confidential ${event.replyTo}`);
        return;
      }

      elizaLogger.info(`[SolverService] Sending response to confidential ${event.replyTo}`, response);

      await sleep(500); // Sleep a little time to wait for the chat
      await this.waku.sendMessage(response, event.replyTo, this.waku.publicKey, event.body.signerPubKey);
    }, { encrypted: true })


    elizaLogger.info('[SolverService] initialized');

    this.initialized = true;
  }
}
