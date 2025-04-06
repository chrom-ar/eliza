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

const PROTOCOLS = { aave: 'Aave V3', curve: 'Curve' };

function buildYieldTransaction({
  protocols,
  chainId,
  tokenAddr,
  tokenAmount,
  recipientAddress,
  fromToken,
}) {
  if (!protocols || protocols.length === 0 || protocols.includes('aave')) {
    const aavePool = AAVE_POOL[chainId]?.[fromToken];

    if (!aavePool) {
      throw new Error(`Aave pool not found for chain ${chainId} and token ${fromToken}`);
    }

    return {
      protocol: 'Aave V3',
      chainId,
      to: aavePool,
      value: 0,
      data: encodeFunctionData({
        abi: AAVE_V3_SUPPLY_ABI,
        functionName: "supply",
        args: [tokenAddr, tokenAmount, recipientAddress, 0]
      }),
    };
  } else if (protocols.includes('curve')) {
    const curvePool = CURVE_POOLS[chainId]?.[fromToken];

    if (!curvePool) {
      throw new Error(`Curve pool not found for chain ${chainId} and token ${fromToken}`);
    }

    const amounts = Array(curvePool.coins_count).fill('0');
    amounts[curvePool.index] = tokenAmount;

    return {
      protocol: 'Curve',
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

  console.error(`Unsupported protocols: ${protocols}`);
}

export async function validateAndBuildYield(message: GeneralMessage): Promise<object> {
  const {
    body: {
      amount,
      fromChain,
      fromToken,
      recipientAddress,
      protocols,
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

  const transaction = buildYieldTransaction({
    protocols,
    chainId,
    tokenAddr,
    tokenAmount,
    recipientAddress,
    fromToken: fromToken.toUpperCase(),
  });

  if (!transaction) {
    return null;
  }

  const protocolName = transaction.protocol;
  delete transaction.protocol;

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
