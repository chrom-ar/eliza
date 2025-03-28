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

const protocols = { aave: 'Aave V3', curve: 'Curve' };

function buildYieldTransaction({
  protocol,
  chainId,
  tokenAddr,
  tokenAmount,
  recipientAddress,
  fromToken,
}) {
  if (!protocol || protocols.aave === protocol) {
    const aavePool = AAVE_POOL[chainId]?.[fromToken];

    if (!aavePool) {
      throw new Error(`Aave pool not found for chain ${chainId} and token ${fromToken}`);
    }

    return {
      chainId,
      to: aavePool,
      value: 0,
      data: encodeFunctionData({
        abi: AAVE_V3_SUPPLY_ABI,
        functionName: "supply",
        args: [tokenAddr, tokenAmount, recipientAddress, 0]
      }),
    };
  } else if (protocols.curve === protocol) {
    const curvePool = CURVE_POOLS[chainId]?.[fromToken];

    if (!curvePool) {
      throw new Error(`Curve pool not found for chain ${chainId} and token ${fromToken}`);
    }

    const amounts = Array(curvePool.coins_count).fill('0');
    amounts[curvePool.index] = tokenAmount;

    return {
      chainId,
      to: curvePool.pool,
      value: 0,
      data: encodeFunctionData({
        abi: CURVE_ADD_LIQUIDITY_ABI,
        functionName: "add_liquidity",
        args: [amounts, 0] // TODO: add slippage protection
      }),
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
    console.log('missing yield fields', { amount, fromChain, fromToken });
    return null;
  }

  const tokenAddr = getTokenAddress(fromChain, fromToken);
  const tokenAmount = getTokenAmount(amount, fromChain, fromToken);

  if (!tokenAddr || !tokenAmount) {
    throw new Error(`Invalid token address or amount for chain ${fromChain} and token ${fromToken}`);
  }

  const chainId = getChainId(fromChain);
  const protocolName = protocols[(protocol || 'aave').toLowerCase()] || protocol;

  const transaction = buildYieldTransaction({
    protocol: protocolName,
    chainId,
    tokenAddr,
    tokenAmount,
    recipientAddress,
    fromToken: fromToken.toUpperCase(),
  });

  return {
    description: `Deposit ${fromToken} in ${protocolName} on ${fromChain}${description ? ` (from previous instructions: "${description}")` : ''}`,
    titles: [
      'Approve', 'Deposit'
    ],
    calls: [
      `Approve ${amount}${fromToken} to be deposited in ${protocolName}`,
      `Deposit ${amount}${fromToken} in ${protocolName}`
    ],
    transactions: [
      {
        chainId,
        to: tokenAddr,
        value: 0,
        data: encodeFunctionData({abi: APPROVE_ABI, functionName: "approve", args: [transaction.to, tokenAmount]})
      },
      transaction,
    ],
  };
}
