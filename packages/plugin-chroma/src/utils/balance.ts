import { elizaLogger } from '@elizaos/core';
import { zeroAddress } from 'viem';
import { getTokenInfo, getAlchemyChainName } from '@chrom-ar/utils';

export interface TokenBalance {
  token: string;
  symbol: string;
  balance: string;
  rawBalance: bigint;
  decimals: number;
  network: string;
}

interface AlchemyBalanceResponse {
  data: {
    tokens: Array<{
      tokenAddress: string;
      tokenBalance: string;
      network?: string;
    }>;
  };
}

const humanDecimals = 6;

function formatBalance(rawBalance: bigint, decimals: number): string {
  if (rawBalance === BigInt(0)) {
    return '0.' + '0'.repeat(humanDecimals);
  }

  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = rawBalance / divisor;
  const fractionalPart = rawBalance % divisor;

  let formatted = integerPart.toString();

  if (fractionalPart > BigInt(0)) {
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    formatted += '.' + fractionalStr;
  } else {
    formatted += '.' + '0'.repeat(humanDecimals);
    return formatted;
  }

  const parts = formatted.split('.');
  const decimal = parts[1].padEnd(humanDecimals, '0').substring(0, humanDecimals);

  return `${parts[0]}.${decimal}`;
}

async function fetchBalancesFromAlchemy(
  address: string,
  networks: string[]
): Promise<AlchemyBalanceResponse | null> {
  const normalizedNetworks = networks.map(network => getAlchemyChainName(network));

  const requestBody = {
    addresses: [
      {
        address: address,
        networks: normalizedNetworks
      }
    ]
  };

  const alchemyApiKey = process.env.CHROMA_ALCHEMY_API_KEY || '';
  if (!alchemyApiKey) {
    elizaLogger.error('No Alchemy API key found in environment.');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.g.alchemy.com/data/v1/${alchemyApiKey}/tokens/balances/by-address`,
      {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      elizaLogger.error(`Alchemy API error: ${response.status} ${errorText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    elizaLogger.error(`Error fetching balances from Alchemy for ${address}:`, error);
    return null;
  }
}

export async function getBalances(
  address: string,
  networks: string | string[],
  tokenSymbols: string[] = ["USDC"]
): Promise<TokenBalance[]> {
  const networkList = Array.isArray(networks) ? networks : [networks];
  const normalizedNetworks = networkList.map(network => getAlchemyChainName(network));
  const normalizedTokenSymbols = tokenSymbols.map(symbol => symbol.toUpperCase());

  try {
    const data = await fetchBalancesFromAlchemy(address, normalizedNetworks);

    if (!data) {
      elizaLogger.error(`No data returned from Alchemy for ${address}`);
      return [];
    }

    const balances: TokenBalance[] = [];

    if (data.data && data.data.tokens) {
      for (const tokenData of data.data.tokens) {
        const tokenAddress = tokenData.tokenAddress || zeroAddress;
        const tokenDetails = getTokenInfo(tokenData.network, tokenAddress);

        if (!tokenDetails || !normalizedTokenSymbols.includes(tokenDetails.symbol.toUpperCase())) {
          continue;
        }

        const rawBalance = BigInt(tokenData.tokenBalance as string);
        const decimals = tokenDetails.decimals;
        const network = typeof tokenData.network === 'string' ? tokenData.network : normalizedNetworks[0];

        balances.push({
          token: tokenAddress,
          symbol: tokenDetails.symbol,
          balance: formatBalance(rawBalance, decimals),
          rawBalance,
          decimals,
          network
        });
      }
    }

    return balances;
  } catch (error) {
    elizaLogger.error(`Error getting balances for ${address}:`, error);
    console.log(error)
    return [];
  }
}
