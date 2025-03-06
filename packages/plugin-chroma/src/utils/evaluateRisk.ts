import { IAgentRuntime, elizaLogger } from '@elizaos/core';

export const evaluateRisk = async (runtime: IAgentRuntime, wallet: string, _transactions: any[], simulation: any) => {

  const results = {};
  const promisses = [];

  if (!simulation.results || simulation.results.length === 0) {
    console.log('No results from simulation', simulation);
    return results;
  }

  simulation.results.map((simResult: any, i) => {
    const addresses = [];

    if (!simResult.transaction) {
      elizaLogger.warn('No transaction from simulation result', simResult);
    } else {
      simResult.transaction.call_trace.map((trace: any) => {
        addresses.push(trace.to, trace.from, trace.address);
      });

      const strAddr = [...new Set(addresses.map((address: string) => address.toLowerCase()))].join(',');

      promisses.push(
        fetch("https://api.forta.network/address-risk/addresses?addresses=" + strAddr).then(async (response) => {
          if (!response.ok) {
            results[i] = { error: 'Failed to evaluate risk with Forta\n' }
            return
          }

          const json = await response.json();

          let text = 'Forta Risk Evaluation: '
          if (json['results'].length === 0) {
            text += `No risk\n`
          } else {
            json["results"].map((res: any) => {
              text += `Address ${res.address} marked as "${res.labels.join(',')}" \n`
            })
          }

          results[i] = { summary: text, results: json["results"] };
        })
      )
    }
  })

  await Promise.all(promisses);

  return results;
}
