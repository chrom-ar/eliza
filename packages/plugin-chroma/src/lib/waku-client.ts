import { elizaLogger, IAgentRuntime } from '@elizaos/core';
import WakuClientInterface from '@elizaos/client-waku';

import { verifyMessage } from 'viem';

export class WakuClient {
  private waku: any;

  constructor(waku: any) {
    this.waku = waku;
  }

  static async new(runtime: IAgentRuntime) {
    const client = await WakuClientInterface.start(runtime);

    return new WakuClient(client);
  }

  async sendMessage(body: object, topic: string, roomId: string) {
    return await this.waku.sendMessage(body, topic, roomId);
  }


  // All chroma messages should be signed by the sender
  async subscribe(topic: string, fn: any, expirationSeconds: number = 20): Promise<void> {
    return await this.waku.subscribe(topic, async (message) => {
      const body = message?.body;

      if (!body?.signer || !body?.signature) {
        elizaLogger.error("[WakuClient-Chroma] Body without signer or signature", body);
        return;
      }

      if (!(await this._checkSignerIsValid(body.signer))) {
        elizaLogger.error("[WakuClient-Chroma] Body without signer or signature", body);
        return;
      }

      if (!(await this._verifyMessage(body.signer, body.signature, JSON.stringify(body.proposal)))) {
        elizaLogger.error("[WakuClient-Chroma] Invalid signature", body);
        return;
      }

      return await fn(message);
    }, expirationSeconds);
  }


  private async _checkSignerIsValid(signer: string) {
    // Check if signer is valid staker and not blacklisted
    return true
  }

  private async _verifyMessage(signer: string, signature: string, message: string): Promise<boolean> {
    if (signer.startsWith('0x') && signer.length == 42) { // EVM signature
      return await verifyMessage({
        signature: signature as `0x${string}`,
        address:   signer as `0x${string}`,
        message:   message
      })
    } else {
      return true // default work around
    }
  }

}
