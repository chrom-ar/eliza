import { elizaLogger } from '@elizaos/core';
import { wormhole } from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { toUniversal } from '@wormhole-foundation/sdk-connect';
import { formatUnits, parseUnits } from 'viem';
import * as chains from 'viem/chains';
import { GeneralMessage, getEnvironment, getChainId } from './helpers';

type WormholeChain =
  | "Ethereum" | "Sepolia"
  | "Optimism" | "OptimismSepolia"
  | "Arbitrum" | "ArbitrumSepolia"
  | "Base" | "BaseSepolia"
  | "Polygon"
  | "Solana";

export function convertToWormholeChain(chain: string): WormholeChain {
  const chainMap: { [key: string]: WormholeChain } = {
    [chains.mainnet.id]: 'Ethereum',
    [chains.sepolia.id]: 'Sepolia',
    [chains.optimism.id]: 'Optimism',
    [chains.optimismSepolia.id]: 'OptimismSepolia',
    [chains.arbitrum.id]: 'Arbitrum',
    [chains.arbitrumSepolia.id]: 'ArbitrumSepolia',
    [chains.base.id]: 'Base',
    [chains.baseSepolia.id]: 'BaseSepolia',
    [chains.polygon.id]: 'Polygon',
    "SOLANA": 'Solana',
  };

  return chainMap[chain] || 'Ethereum';
}

export async function buildBridgeTransaction(message: GeneralMessage) {
  const {
    body: {
      amount,
      fromAddress,
      fromChain,
      recipientAddress,
      recipientChain,
    }
  } = message;

  const environment = getEnvironment(fromChain);
  const wh = await wormhole(environment, [evm, solana]);

  const sourceChain = wh.getChain(convertToWormholeChain(getChainId(fromChain)));
  const destinationChain = wh.getChain(convertToWormholeChain(getChainId(recipientChain)));

  const automaticCircleBridge = await sourceChain.getAutomaticCircleBridge();
  const relayerFee = await automaticCircleBridge.getRelayerFee(destinationChain.chain);

  // We should add this to the response.
  elizaLogger.debug('Circle Relayer Fee:', formatUnits(relayerFee, 6), 'USDC');

  const unsignedTxs = automaticCircleBridge.transfer(
    toUniversal(sourceChain.chain, fromAddress),
    { chain: destinationChain.chain, address: toUniversal(destinationChain.chain, recipientAddress) },
    parseUnits(amount, 6)
  );

  const processedTxs = [];

  for await (const tx of unsignedTxs) {
    const processedTx = JSON.parse(JSON.stringify(tx, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    // We have also the following fields in the tx object:
    // "network": "Testnet",
    // "chain": "Sepolia",
    // "description": "ERC20.approve of CircleRelayer",
    // "parallelizable": false
    processedTxs.push({
      transaction: processedTx.transaction,
      description: processedTx.description
    });
  }

  return processedTxs;
}
