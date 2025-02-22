import {
    settings,
    elizaLogger,
} from "@elizaos/core";
import { Connection, PublicKey, VersionedTransaction, clusterApiUrl } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import BigNumber from "bignumber.js";

const SOL_ADDRESS = "So11111111111111111111111111111111111111112";

const withFee = false

export async function swapToken(
      amount,
      fromToken,
      toToken,
      fromAddress,
): Promise<any> {
    try {
        // Get the decimals for the input token
        const decimals =
            fromToken === SOL_ADDRESS
                ? 9
                : (await getTokenDecimals(fromToken));

        elizaLogger.log("Decimals:", decimals.toString());

        const amountBN = new BigNumber(amount);
        const adjustedAmount = amountBN.multipliedBy(
            new BigNumber(10).pow(decimals)
        );

        elizaLogger.log("Fetching quote with params:", {
            inputMint: fromToken,
            outputMint: toToken,
            amount: adjustedAmount,
        });

        let quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${fromToken}&outputMint=${toToken}&amount=${adjustedAmount}&dynamicSlippage=true&maxAccounts=64`
        if (withFee)
            quoteUrl += '&platformFeeBps=5'

        const quoteResponse = await fetch(quoteUrl);
        const quoteData = await quoteResponse.json();

        if (!quoteData || quoteData.error) {
            elizaLogger.error("Quote error:", quoteData);
            throw new Error(
                `Failed to get quote: ${quoteData?.error || "Unknown error"}`
            );
        }

        elizaLogger.log("Quote received:", quoteData);


        const swapRequestBody = {
            quoteResponse: quoteData,
            userPublicKey: fromAddress,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: { "maxBps": 300 },
            priorityLevelWithMaxLamports: {
                maxLamports: 4000000,
                priorityLevel: "veryHigh",
            }
        };

        if (withFee)  {
            // This should be created for sure, NOT TESTED
            const feeAccount = getAssociatedTokenAddress(
                new PublicKey(fromAddress),
                new PublicKey(settings.SOLANA_FEE_ADDRESS),
            );

            swapRequestBody['feeAccount'] = feeAccount
        }

        elizaLogger.log("Requesting swap with body:", swapRequestBody);

        const swapResponse = await fetch("https://api.jup.ag/swap/v1/swap", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(swapRequestBody),
        });

        const swapData = await swapResponse.json();

        if (!swapData || !swapData.swapTransaction) {
            elizaLogger.error("Swap error:", swapResponse);
            throw new Error(
                `Failed to get swap transaction: ${swapData?.error || "No swap transaction returned"}`
            );
        }

        elizaLogger.log("Swap transaction received");
        return { quoteResponse, serializedTransaction: swapData.swapTransaction };
    } catch (error) {
        elizaLogger.error("Error in swapToken:", error);
        throw error;
    }
}

export async function getTokenDecimals(
    mintAddress: string
): Promise<number> {
    const connection = new Connection(clusterApiUrl("devnet"));
    const mintPublicKey = new PublicKey(mintAddress);
    const tokenAccountInfo =
        await connection.getParsedAccountInfo(mintPublicKey);

    // Check if the data is parsed and contains the expected structure
    if (
        tokenAccountInfo.value &&
        typeof tokenAccountInfo.value.data === "object" &&
        "parsed" in tokenAccountInfo.value.data
    ) {
        const parsedInfo = tokenAccountInfo.value.data.parsed?.info;
        if (parsedInfo && typeof parsedInfo.decimals === "number") {
            return parsedInfo.decimals;
        }
    }

    throw new Error("Unable to fetch token decimals");
}
