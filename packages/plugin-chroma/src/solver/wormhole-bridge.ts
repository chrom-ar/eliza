import { wormhole } from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import { toNative } from '@wormhole-foundation/sdk-connect';
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

  const wh = await wormhole("Testnet", [evm]);

  const sourceChain = wh.getChain(convertToWormholeChain(fromChain));
  const destinationChain = wh.getChain(convertToWormholeChain(recipientChain));

  const circleBridge = await sourceChain.getCircleBridge();

  const unsignedTxs = circleBridge.transfer(
    toNative(sourceChain.chain, fromAddress),
    { chain: destinationChain.chain, address: toNative(destinationChain.chain, recipientAddress) },
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

  return processedTxs;
}
