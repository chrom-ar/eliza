// import fetch from 'node-fetch'
import { IAgentRuntime, elizaLogger } from '@elizaos/core';
import { getTokenInfo } from '@chrom-ar/utils';

const request = async (runtime: IAgentRuntime, method: string, path: string, body?: string): Promise<any> => {
  const url = `https://api.tenderly.co/api/v1/account/${runtime.getSetting('TENDERLY_ACCOUNT')}/project/${runtime.getSetting('TENDERLY_PROJECT')}/${path}`;
  const accessKey = runtime.getSetting("TENDERLY_API_KEY");

  return await fetch(url, {
    method,
    headers: {
      'X-Access-Key': accessKey
    },
    body
  });
}

export const simulateTxs = async (runtime: IAgentRuntime, wallet: string, transactions: any[]) => {
  // Filter out transactions without required properties
  const validTransactions = transactions.filter(tx => {
    if (!tx.chainId) {
      elizaLogger.warn(`Skipping transaction simulation with missing chainId: ${JSON.stringify(tx)}`);
      return false;
    }
    if (!tx.to) {
      elizaLogger.warn(`Skipping transaction simulation with missing 'to' address: ${JSON.stringify(tx)}`);
      return false;
    }
    return true;
  });

  if (validTransactions.length === 0) {
    elizaLogger.error("No valid transactions to simulate");
    return { error: 'No valid transactions to simulate' };
  }

  const txs = validTransactions.map(tx => ({
    network_id: tx.chainId,
    from: wallet,
    to: tx.to,
    input: tx.data,
    value: tx.value,
    simulation_type: "quick", // full is the default [full || quick]
    ...tx.simulationExtras
  }));

  const response = await request(
    runtime,
    'POST',
    'simulate-bundle',
    JSON.stringify({
      simulations: txs
    })
  );

  if (!response.ok) {
    return { error: 'Failed to simulate' };
  }

  const result = await response.json();

  await shareSimulations(runtime, result.simulation_results);

  const summary = await buildSummary(result.simulation_results);

  return summary;
}

const shareSimulations = async (runtime: IAgentRuntime, simulations: any[]) => {
  let promises = []
  for (const simulation of simulations) {
    if (!simulation.simulation.id) {
      continue;
    }

    promises.push(
      request(runtime, 'POST', `simulations/${simulation.simulation.id}/share`)
    );
  }

  const results = await Promise.all(promises); // No content
  for (const result of results) {
    if (!result.ok) {
      // console.log("Share error:", result);
    }
  }
}

const buildSummary = (simulations: any[]) => {
  return { results: simulations.map(simulationResult => {
    const link = `https://www.tdly.co/shared/simulation/${simulationResult.simulation.id}`;
    const error = simulationResult.simulation.error_message ||
      simulationResult.transaction?.error_message;

    if (error && error != '') {
      return { error, link };
    }

    const summary = [];
    const info = simulationResult.transaction.transaction_info;
    const owner = info.call_trace.from.toLowerCase();

    info.asset_changes?.forEach(change => {
      const amount = humanizeAmount(change);

      if (change.type === 'Mint') {
        summary.push(`+ Minted ${amount}`);
      } else if (change.type === 'Burn') {
        summary.push(`- Burned ${amount}`);
      } else if (change.type === 'Transfer') {
        if (change.from.toLowerCase() == owner ) {
          summary.push(`- Transferred ${amount}`);
        } else if (change.to.toLowerCase() == owner ){
          summary.push(`+ Transferred ${amount}`);
        // } else {
        //   summary.push(`(?) Transferred ${amount} from ${change.from} to ${change.to}`)
        }
      }
    })

    info.exposure_changes?.forEach(change => {
      if (change.type === 'Approve' && change.owner.toLowerCase() == owner){
        let amount;
        if (Number(change.amount) > 1_000_000) {
          amount = "+1M";
        } else {
          amount = humanizeAmount(change);
        }

        summary.push(`* Approve ${amount} to be spent by ${change.spender}`);
      }
    });

    return { summary, link, ...simulationResult };
  })}
};

const humanizeAmount = (change: any) => {
  const contractAddress = change.token_info.contract_address?.toLowerCase();
  const knownToken = getTokenInfo(undefined, contractAddress);
  const symbol = change.token_info.symbol?.toUpperCase() ||
    (knownToken ? knownToken.symbol : "(unknown token)");

  let displayAmount = change.raw_amount;
  if (change.amount) {
    displayAmount = change.amount;
  } else if (knownToken) {
    displayAmount = (Number(change.raw_amount) / Math.pow(10, knownToken.decimals)).toString();
  }

  return `${displayAmount} ${symbol} ${change.dollar_value ? `($${change.dollar_value})` : ""}`;
}
