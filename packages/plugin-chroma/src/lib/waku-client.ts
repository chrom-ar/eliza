import { elizaLogger, IAgentRuntime } from '@elizaos/core';
import WakuClientInterface from '@elizaos/client-waku';

import { createPublicClient, http, verifyMessage } from 'viem';
import { baseSepolia } from 'viem/chains'
import { Keypair, PublicKey } from '@solana/web3.js';
import nacl from "tweetnacl";
import tweetnaclUtils from 'tweetnacl-util';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PythBalance, StakeConnection } from "staking-tmp";
import { Staking, IDL, stakingAbi, stakingEvmAddress } from "./staking-data";

const url = process.env.CHROMA_SOLANA_RPC_URL || clusterApiUrl('devnet');
const connection = new Connection(url);
const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), {}) // only used for reading
const config = {
  stakingProgramId: new PublicKey(process.env.CHROMA_STAKING_PROGRAM_ID!),
};

let stakeConnection: StakeConnection | null = null;

// TODO: Change this with whatever chain we use in prod
const evmClient = createPublicClient({
  chain: baseSepolia,
  transport: http()
});

export class WakuClient {
  private waku: any;

  constructor(waku: any) {
    this.waku = waku;
  }

  static async new(runtime: IAgentRuntime) {
    const client = await WakuClientInterface.start(runtime);

    return new WakuClient(client);
  }

  async sendMessage(body: object, topic: string, replyTo: string, encryptionPubKey?: string) {
    return await this.waku.sendMessage(body, topic, replyTo, encryptionPubKey);
  }

  // All chroma messages should be signed by the sender
  async subscribe(topic: string, fn: any, opts = { expirationSeconds: 20, encrypted: false }): Promise<void> {
    return await this.waku.subscribe(topic, async (message) => {
      const body = message?.body;

      console.log('message', message, message.body);

      if (!body?.signer || !body?.signature) {
        elizaLogger.error("[WakuClient-Chroma] Body without signer or signature", body);
        return;
      }

      // proposal is not always present
      // TODO: add validation for other keys
      if (body.proposal &&!(await this._verifyMessage(body.signer, body.signature, JSON.stringify(body.proposal)))) {
        elizaLogger.error("[WakuClient-Chroma] Invalid signature", body);
        return;
      }

      // TODO: remove the false part, tmp until devnet / mainnet deploy
      if (false && !(await this._checkSignerIsValid(body.signer))) {
        elizaLogger.error("[WakuClient-Chroma] Invalid signer", body);
        return;
      }

      return await fn(message);
    }, opts);
  }


  private async _checkSignerIsValid(signer: string) {
    elizaLogger.info(`[WakuClient-Chroma] Checking Solver ${signer} stake...`);

    if (signer.startsWith("0x")) {
      return await this._checkEvmSigner(signer);
    } else {
      return await this._checkSolanaSigner(signer);
    }
  }

  private async _checkEvmSigner(signer: string) {
    try {
      const [_date, staked, locked] = await evmClient.readContract({
        address: stakingEvmAddress,
        abi: stakingAbi,
        functionName: 'getStakerInfo',
        args: [signer],
      });

      const amount = (staked - locked) / 1_000_000_000n;
      if (amount >= 90n) {
        elizaLogger.info(`[WakuClient-Chroma] Solver has ${amount.toString()} staked ✅`);
        return true
      }

      return false
    } catch (error) {
      console.log("ERROR::", error)
      elizaLogger.error("[WakuClient-Chroma] Error checking signer", error);
      return false;
    }
  }

  private async _checkSolanaSigner(signer: string) {
    try {
      const program = new Program<Staking>(IDL, provider);

      stakeConnection = stakeConnection || await StakeConnection.createStakeConnection(
        connection,
        (program.provider as AnchorProvider).wallet as Wallet,
        config.stakingProgramId
      );

      // Find stakeAccount for solver/signer
      const [stakeAcc] = await stakeConnection.getStakeAccounts(new PublicKey(signer));

      if (!stakeAcc)
        return false;

      const summary = await stakeAcc.getBalanceSummary(await stakeConnection!.getTime());

      // console.log("Summary: ", summary, summary.locked.locked);
      elizaLogger.info(`[WakuClient-Chroma] Solver has ${summary.locked.locked.toString()} staked ✅`);

      // TODO CHANGE TO 100
      return summary.locked.locked.gte(PythBalance.fromNumber(90e3)); // Min staked (pyth uses 6 decimals and we 9...)
    } catch (error) {
      console.log("ERROR::", error)
      elizaLogger.error("[WakuClient-Chroma] Error checking signer", error);
      return false;
    }
  }

  private async _verifyMessage(signer: string, encodedSignature: string, message: string): Promise<boolean> {
    if (signer.startsWith("0x")) {
      return this._verifyEvmMessage(signer, encodedSignature, message);
    } else {
      return this._verifySolanaMessage(signer, encodedSignature, message);
    }
  }

  private async _verifyEvmMessage(signer: string, signature: string, message: string): Promise<boolean> {
    return await verifyMessage({
      signature: signature as `0x${string}`,
      address:   signer as `0x${string}`,
      message:   message
    })
  }

  private async _verifySolanaMessage(signer: string, encodedSignature: string, message: string): Promise<boolean> {
    const signature = new Uint8Array(Buffer.from(encodedSignature, 'base64'))
    const result = nacl.sign.detached.verify(
      tweetnaclUtils.decodeUTF8(message),
      signature,
      (new PublicKey(signer)).toBytes(),
    );

    return result;
  }
}