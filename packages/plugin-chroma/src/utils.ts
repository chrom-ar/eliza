const debug = require("debug")("eliza:dev");

import { IAgentRuntime, MemoryManager } from '@elizaos/core';
import { Coinbase, Wallet, ExternalAddress } from '@coinbase/coinbase-sdk';
import { CdpWalletProvider, CHAIN_ID_TO_NETWORK_ID } from '@coinbase/agentkit';

export const abi = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "_owner",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "balance",
        "type": "uint256"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];


export const getWalletProvider = async (wallet: any): Promise<CdpWalletProvider> => {
  const networkId = await wallet.getNetworkId()
  const chainId = Object.keys(CHAIN_ID_TO_NETWORK_ID).find(
    k => CHAIN_ID_TO_NETWORK_ID[k] === networkId
  );
  const walletAddr = (await wallet.getDefaultAddress()).id

  // @ts-ignore
  return new CdpWalletProvider({
    wallet,
    address: walletAddr,
    network: {
      protocolFamily: "evm",
      chainId,
      networkId
    }
  });
}

export const sendTransaction = async (provider: CdpWalletProvider, transaction: any, waitForConfirmation: boolean  = true): Promise<object> => {
  const preparedTransaction = await provider.prepareTransaction(
    transaction.to,
    transaction.value,
    transaction.data
  )
  // @ts-ignore
  const signature = await provider.signTransaction({...preparedTransaction})
  const signedPayload = await provider.addSignatureAndSerialize(preparedTransaction, signature)
  const extAddr = new ExternalAddress(provider.getNetwork().networkId, provider.getAddress())
  const tx = await extAddr.broadcastExternalTransaction(signedPayload.slice(2))

  if (waitForConfirmation) {
    // @ts-ignore
    await provider.waitForTransactionReceipt(tx.transactionHash) // needed for sequential transactions
  }

  return tx
}

export const getBalanceFor = async (provider: CdpWalletProvider, address: string, humanize: boolean = false): Promise<string | BigInt> => {
  const [bal, decimals] = (await Promise.all([
    provider.readContract({
      address: address as `0x${string}`,
      functionName: "balanceOf",
      args: [provider.getAddress()],
      // @ts-ignore
      abi
    }),
    provider.readContract({
      address: address as `0x${string}`,
      functionName: "decimals",
      args: [],
      // @ts-ignore
      abi
    })
  ])).map(v => Number(v))

  // @ts-ignore
  return humanize ? (bal / 10 ** decimals).toFixed(6) : bal
}

export const configureCDP = async (runtime: IAgentRuntime) => {
  // Configure Coinbase SDK
  Coinbase.configure({
    apiKeyName: runtime.getSetting("CHROMA_CDP_API_KEY_NAME"),
    privateKey: runtime.getSetting("CHROMA_CDP_API_KEY_PRIVATE_KEY").replace(/\\n/g, "\n"),
    useServerSigner: true
  });
}

export const getWalletAndProvider = async (runtime: IAgentRuntime, walletId: string): Promise<[Wallet, CdpWalletProvider]> => {
  await configureCDP(runtime)

  const wallet = await Wallet.fetch(walletId);
  const provider = await getWalletProvider(wallet)

  return [wallet, provider]
}

export const getWalletFromMemory = async (runtime: IAgentRuntime, roomId: string): Promise<object> => {
  const walletManager = new MemoryManager({
    runtime,
    tableName: 'wallets'
  });

  // Check if user already has a wallet
  // @ts-ignore
  const [existingWallet] = await walletManager.getMemories({ roomId, count: 1 });

  console.log("Existing wallet", existingWallet?.content)

  return existingWallet?.content
}

export const createWallet = async (runtime: IAgentRuntime): Promise<Wallet> => {
  await configureCDP(runtime)

  return await Wallet.create();
}

export const simulateTxs = async (runtime: IAgentRuntime, wallet: string, transactions: any[]) => {
  const url = `https://api.tenderly.co/api/v1/account/${runtime.getSetting("TENDERLY_ACCOUNT")}/project/${runtime.getSetting("TENDERLY_PROJECT")}/`
  const accessKey = runtime.getSetting("TENDERLY_ACCESS_KEY")

  const txs = transactions.map(tx => ({
    network_id: tx.chainId,
    from: wallet,
    to: tx.to,
    input: tx.data,
    value: tx.value,
    simulation_type: "full", // full is the default [full || quick]
  }))

  const response = await fetch(`${url}/simulate-bundle`, {
    method: 'POST',
    headers: {
      'X-Access-Key': accessKey
    },
    body: JSON.stringify({
      simulations: txs
    })
  })
  let resp
  
  if (response.ok) {
    resp = await response.json() 
    await fetch(`${url}/simulations/${resp.simulation_bundle_id}/share`, {
      method: 'POST',
      headers: {
        'X-Access-Key': accessKey
      }
  })
  } else {
    resp = { error: "Failed to simulate transactions" }
  }

  debug("Tu vieja", {response: resp})

  return resp
}

export const simulateTxs = async (runtime: IAgentRuntime, wallet: string, transactions: any[]) => {
  const url = `https://api.tenderly.co/api/v1/account/${runtime.getSetting("TENDERLY_ACCOUNT")}/project/${runtime.getSetting("TENDERLY_PROJECT")}/simulate-bundle`
  const accessKey = runtime.getSetting("TENDERLY_ACCESS_KEY")

  const txs = transactions.map(tx => ({
    network_id: tx.chainId,
    from: wallet,
    to: tx.to,
    input: tx.data,
    value: tx.value,
    simulation_type: "full", // full is the default [full || quick]
  }))

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Access-Key': accessKey
    },
    body: JSON.stringify({
      simulations: txs
    })
  })
  
  if (!response.ok) 
    return { error: `Failed to simulate transaction${txs.length > 1 ? 's' : ''}` }


  const result = await response.json()

  await shareSimulations(runtime, result.simulation_results)

  const summary = await buildSummary(result.simulation_results)

  debug("Tu vieja", { result, summary })

  return summary
}

const shareSimulations = async (runtime: IAgentRuntime, simulations: any[]) => {
  let promises = [] 
  for (const simulation of simulations) {
    promises.push(fetch(`https://api.tenderly.co/api/v1/account/${runtime.getSetting("TENDERLY_ACCOUNT")}/project/${runtime.getSetting("TENDERLY_PROJECT")}/simulations/${simulation.simulation.id}/share`, { method: 'POST', headers: { 'X-Access-Key': runtime.getSetting("TENDERLY_ACCESS_KEY") }}))
  }

  const results = await Promise.all(promises)
  for (const result of results) {
    console.log("Share:", result, (await result.json()))
  }
}

const buildSummary = (simulations: any[]) => {
  const summary = []

  return simulations.map(simulationResult => {
    const info = simulationResult.transaction.transaction_info
    const owner = info.call_trace.from.toLowerCase()


    info.asset_changes.forEach(change => {
      const amount = humanizeAmount(change)
      
      if (change.type === 'Mint') {
        summary.push(`+ Minted ${amount}`)
      } else if (change.type === 'Burn') {
        summary.push(`- Burned ${amount}`)
      } else if (change.type === 'Transfer') {
        if (change.from.toLowerCase() == owner ) {
          summary.push(`- Transferred ${amount} `)
        } else if (change.to.toLowerCase() == owner ){
          summary.push(`+ Transferred ${amount}`)
        // } else {
        //   summary.push(`(?) Transferred ${amount} from ${change.from} to ${change.to}`)
        }
      }
    })

    info.exposure_changes.forEach(change => {
      if (change.type === 'Approval' && change.owner.toLowerCase() == owner){
        summary.push(`* Approve ${humanizeAmount(change)} to be spent by ${change.spender}`)
      }
    })
  })
};

const humanizeAmount = (change: any) => {
  const amount = change.amount || change.raw_amount;
  const symbol = change.token_info.symbol?.toUpperCase() || '??'
 
  return `${amount} ${symbol} ${change.dollar_value ? `($${change.dollar_value})` : ""}`
}

 