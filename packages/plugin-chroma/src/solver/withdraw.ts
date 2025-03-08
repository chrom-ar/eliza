import { encodeFunctionData } from 'viem';

import { AAVE_V3_WITHDRAW_ABI, CURVE_REMOVE_LIQUIDITY_ONE_COIN_ABI } from './utils/abis';
import {
  AAVE_POOL,
  CURVE_POOLS,
  GeneralMessage,
  getChainId,
  getTokenAddress,
  getTokenAmount
} from "./helpers";

function buildWithdrawTransactions({
  protocol,
  chainId,
  tokenAddr,
  tokenAmount,
  fromAddress,
  fromToken,
}) {
  if (!protocol || protocol.toLowerCase() === 'aave') {
    const aavePool = AAVE_POOL[chainId]?.[fromToken.toUpperCase()];

    if (!aavePool) {
      throw new Error(`Aave pool not found for chain ${chainId} and token ${fromToken}`);
    }

    return {
      protocolName: 'Aave V3',
      title: 'Withdraw',
      call: `Withdraw ${tokenAmount}${fromToken} from AavePool to ${fromAddress}`,
      transaction: {
        chainId,
        to: aavePool,
        value: 0,
        data: encodeFunctionData({abi: AAVE_V3_WITHDRAW_ABI, functionName: "withdraw", args: [tokenAddr, tokenAmount, fromAddress]})
      }
    };
  } else if (protocol.toLowerCase() === 'curve') {
    const token = fromToken.toUpperCase() === 'CRVUSDC' ? 'USDC' : fromToken;
    const curvePool = CURVE_POOLS[chainId]?.[token];

    if (!curvePool) {
      throw new Error(`Curve pool not found for chain ${chainId} and token ${fromToken}`);
    }

    return {
      protocolName: 'Curve',
      title: 'Remove Liquidity',
      call: `Remove ${tokenAmount}${fromToken} liquidity from Curve pool to ${fromAddress}`,
      transaction: {
        chainId,
        to: curvePool.pool,
        value: 0,
        data: encodeFunctionData({
          abi: CURVE_REMOVE_LIQUIDITY_ONE_COIN_ABI,
          functionName: "remove_liquidity_one_coin",
          args: [tokenAmount, curvePool.index, 0] // TODO: add slippage protection
        })
      }
    };
  }

  throw new Error(`Unsupported protocol: ${protocol}`);
}

export async function validateAndBuildWithdraw(message: GeneralMessage): Promise<object> {
  let {
    body: {
      amount,
      fromChain,
      fromToken,
      fromAddress,
      protocol,
      description,
    }
  } = message;

  if (!amount || !fromChain || !fromToken) {
    console.log('missing fields');
    return null;
  }

  const tokenAddr = getTokenAddress(fromChain, fromToken);
  const tokenAmount = getTokenAmount(amount, fromChain, fromToken);

  if (!tokenAddr || !tokenAmount) {
    throw new Error(`Invalid token address or amount for chain ${fromChain} and token ${fromToken}`);
  }

  const chainId = getChainId(fromChain);

  const protocolTx = buildWithdrawTransactions({
    protocol,
    chainId,
    tokenAddr,
    tokenAmount,
    fromAddress,
    fromToken
  });

  return {
    description: `Withdraw ${fromToken} from ${protocolTx.protocolName} on ${fromChain}${description ? ` (from previous instructions: "${description}")` : ''}`,
    titles: [protocolTx.title],
    calls: [protocolTx.call],
    transactions: [protocolTx.transaction]
  }
}
