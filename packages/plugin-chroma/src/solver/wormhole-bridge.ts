import { wormhole } from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { toUniversal } from '@wormhole-foundation/sdk-connect';
import { parseUnits } from 'viem';
import { GeneralMessage } from './transaction_helpers';

type WormholeChain = 
  | "Ethereum" | "Sepolia" 
  | "Optimism" | "OptimismSepolia" 
  | "Arbitrum" | "ArbitrumSepolia" 
  | "Base" | "BaseSepolia" 
  | "Polygon" | "PolygonSepolia" 
  | "Solana";

function convertToWormholeChain(chain: string): WormholeChain {
  const chainMap: { [key: string]: WormholeChain } = {
    'ethereum': 'Ethereum',
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

  console.log('building bridge transaction');

  const wh = await wormhole("Testnet", [evm, solana]);

  const sourceChain = wh.getChain(convertToWormholeChain(fromChain));
  const destinationChain = wh.getChain(convertToWormholeChain(recipientChain));

  const circleBridge = await sourceChain.getCircleBridge();

  // For some reason, toNative is not working.
  //console.log('native address', toNative(sourceChain.chain, fromAddress));
  //console.log('destination address', toNative(destinationChain.chain, recipientAddress));

  const unsignedTxs = circleBridge.transfer(
    //toNative(sourceChain.chain, fromAddress),
    toUniversal(sourceChain.chain, fromAddress),
    //{ chain: destinationChain.chain, address: toNative(destinationChain.chain, recipientAddress) },
    { chain: destinationChain.chain, address: toUniversal(destinationChain.chain, recipientAddress) },
    parseUnits(amount, 6)
  );

  const processedTxs = [];
  
  for await (const tx of unsignedTxs) {
    // Convert any bigint values in the transaction to strings
    const processedTx = JSON.parse(JSON.stringify(tx, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    
    processedTxs.push(processedTx);
  }

  console.log('processedTxs', processedTxs);

  return processedTxs;
}
