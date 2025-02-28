import { IAgentRuntime } from '@elizaos/core';
import * as fs from 'fs';

export const evaluateRisk = async (runtime: IAgentRuntime, wallet: string, _transactions: any[], simulation: any) => {
  let addresses = []

  simulation.results.map((result: any) => {
    result.transaction.call_trace.map((trace: any) => {
      addresses.push(trace.to, trace.from, trace.address);
    });
  })

  const strAddr = [...new Set(addresses.map((address: string) => address.toLowerCase()))].join(',');

  const response = await fetch(
    "https://api.forta.network/address-risk/addresses?addresses=" + strAddr,
  );

  if (!response.ok) {
    return { summary: `Failed to evaluate risk with Forta`, results: [] };
  }

  const result = await response.json();

  let text = 'Forta Risk Evaluation\n'
  if (result['results'].length === 0) {
    text += `No risk found in the transactions\n`
  } else {
    result["results"].map((res: any) => {
      text += `Address ${res.address} marked as "${res.labels.join(',')}" \n`
    })
  }

  return { summary: text, results: result["results"] };
}
