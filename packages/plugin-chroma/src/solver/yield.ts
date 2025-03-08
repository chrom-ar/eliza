import { encodeFunctionData } from 'viem';

import { AAVE_V3_SUPPLY_ABI, APPROVE_ABI, CURVE_ADD_LIQUIDITY_ABI } from './utils/abis';
import {
  AAVE_POOL,
  CURVE_POOLS,
  GeneralMessage,
  getChainId,
  getTokenAddress,
  getTokenAmount
} from './helpers';

function buildYieldTransactions({
  protocol,
  chainId,
  tokenAddr,
  tokenAmount,
  recipientAddress,
  fromToken,
}) {
  if (!protocol || protocol.toLowerCase() === 'aave') {
    const aavePool = AAVE_POOL[chainId]?.[fromToken];

    if (!aavePool) {
      throw new Error(`Aave pool not found for chain ${chainId} and token ${fromToken}`);
    }

    return {
      protocolName: 'Aave V3',
      title: 'Supply',
      call: `Supply ${tokenAmount}${fromToken} in AavePool. ${recipientAddress} will receive the a${fromToken} tokens`,
      targetAddress: aavePool,
      transaction: {
        chainId,
        to: aavePool,
        value: 0,
        data: encodeFunctionData({abi: AAVE_V3_SUPPLY_ABI, functionName: "supply", args: [tokenAddr, tokenAmount, recipientAddress, 0]})
      }
    };
  } else if (protocol.toLowerCase() === 'curve') {
    const curvePool = CURVE_POOLS[chainId]?.[fromToken];

    if (!curvePool) {
      throw new Error(`Curve pool not found for chain ${chainId} and token ${fromToken}`);
    }

    const amounts = Array(curvePool.coins_count).fill('0');

    amounts[curvePool.index] = tokenAmount;

    return {
      protocolName: 'Curve',
      title: 'Add Liquidity',
      call: `Add ${tokenAmount}${fromToken} liquidity to Curve pool. ${recipientAddress} will receive the LP tokens`,
      targetAddress: curvePool.pool,
      transaction: {
        chainId,
        to: curvePool.pool,
        value: 0,
        data: encodeFunctionData({
          abi: CURVE_ADD_LIQUIDITY_ABI,
          functionName: "add_liquidity",
          args: [amounts, 0] // TODO: add slippage protection
        })
      }
    };
  }

  throw new Error(`Unsupported protocol: ${protocol}`);
}

export async function validateAndBuildYield(message: GeneralMessage): Promise<object> {
  const {
    body: {
      amount,
      fromChain,
      fromToken,
      recipientAddress,
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
  const protocolTx = buildYieldTransactions({
    protocol,
    chainId,
    tokenAddr,
    tokenAmount,
    recipientAddress,
    fromToken: fromToken.toUpperCase()
  });

  return {
    description: `Deposit ${fromToken} in ${protocolTx.protocolName} on ${fromChain}${description ? ` (from previous instructions: "${description}")` : ''}`,
    titles: [
      'Approve', protocolTx.title
    ],
    calls: [
      `Approve ${amount}${fromToken} to be deposited in ${protocolTx.protocolName}`,
      protocolTx.call
    ],
    transactions: [
      {
        chainId,
        to: tokenAddr,
        value: 0,
        data: encodeFunctionData({abi: APPROVE_ABI, functionName: "approve", args: [protocolTx.targetAddress, tokenAmount]})
      },
      protocolTx.transaction
    ]
  }
}
