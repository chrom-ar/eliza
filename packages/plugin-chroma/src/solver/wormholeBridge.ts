import { elizaLogger } from '@elizaos/core';
import { wormhole } from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { toUniversal } from '@wormhole-foundation/sdk-connect';
import { formatUnits, parseUnits } from 'viem';
import { GeneralMessage } from './transactionHelpers';

type WormholeChain = 
  | "Ethereum" | "Sepolia" 
  | "Optimism" | "OptimismSepolia" 
  | "Arbitrum" | "ArbitrumSepolia" 
  | "Base" | "BaseSepolia" 
  | "Polygon" | "PolygonSepolia" 
  | "Solana";

export function convertToWormholeChain(chain: string): WormholeChain {
  const chainMap: { [key: string]: WormholeChain } = {
    'ethereum': 'Ethereum',
    'ethereum-sepolia': 'Sepolia',
    'sepolia': 'Sepolia',
    'optimism': 'Optimism',
    'optimism-sepolia': 'OptimismSepolia',
    'arbitrum': 'Arbitrum',
    'arbitrum-sepolia': 'ArbitrumSepolia',
    'base': 'Base',
    'base-sepolia': 'BaseSepolia',
    'polygon': 'Polygon',
    'polygon-sepolia': 'PolygonSepolia',
    'solana': 'Solana'
  };
  
  const normalizedChain = chain.toLowerCase();
  return chainMap[normalizedChain] || 'Ethereum';
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

  const wh = await wormhole("Testnet", [evm, solana]);

  const sourceChain = wh.getChain(convertToWormholeChain(fromChain));
  const destinationChain = wh.getChain(convertToWormholeChain(recipientChain));

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
    processedTxs.push(processedTx.transaction);
  }

  return processedTxs;
}
