import { ethers } from 'ethers';
import { elizaLogger } from '@elizaos/core';
import { TOKENS, ERC20_ABI } from './addresses';
import { getProvider } from './provider';

export interface TokenBalance {
  token: string;
  symbol: string;
  balance: string;
  rawBalance: BigInt;
  decimals: number;
}

export async function getTokenBalance(
  address: string,
  tokenAddress: string,
  network: string,
  humanReadable: boolean = true
): Promise<TokenBalance | null> {
  try {
    const provider = getProvider(network);
    if (!provider) {
      return null;
    }

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [balanceBN, decimals, symbol] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
      contract.symbol()
    ]);

    const rawBalance = BigInt(balanceBN.toString());
    const balance = humanReadable
      ? ethers.utils.formatUnits(balanceBN, decimals)
      : balanceBN.toString();

    return {
      token: tokenAddress,
      symbol: symbol,
      balance: humanReadable ? parseFloat(balance).toFixed(6) : balance,
      rawBalance,
      decimals: Number(decimals)
    };
  } catch (error) {
    elizaLogger.error(`Error getting token balance for ${address} on ${network}:`, error);
    return null;
  }
}

export async function getBalances(
  address: string,
  network: string,
  tokenSymbols: string[] = ["USDC"]
): Promise<TokenBalance[]> {
  const networkUpper = network.toUpperCase();
  console.log("networkUpper", networkUpper);

  try {
    // Create a list of promises for parallel execution
    const balancePromises = tokenSymbols.map(symbol => {
      const tokenAddress = TOKENS[networkUpper]?.[symbol];
      if (!tokenAddress) {
        elizaLogger.warn(`Token address not found for ${symbol} on ${networkUpper}`);
        return Promise.resolve(null);
      }
      return getTokenBalance(address, tokenAddress, network);
    });

    // Execute all balance checks in parallel
    const results = await Promise.all(balancePromises);

    console.log("results", results);

    // Filter out null results
    return results.filter(balance => balance !== null) as TokenBalance[];
  } catch (error) {
    elizaLogger.error(`Error getting balances for ${address} on ${network}:`, error);
    return [];
  }
}