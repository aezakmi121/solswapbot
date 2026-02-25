import { Router, Request, Response } from "express";
import { getQuote } from "../../jupiter/quote";
import { getTokenPriceUsd, estimateFeeUsd } from "../../jupiter/price";
import { getTokenDecimals } from "../../jupiter/tokens";
import { formatTokenAmount } from "../../utils/formatting";

export const quoteRouter = Router();

/**
 * GET /api/quote
 * Fetches a swap quote from Jupiter with full USD breakdown.
 *
 * Query params:
 *   inputMint, outputMint,
 *   humanAmount (human-readable, e.g. "1.5") — preferred, backend converts using correct decimals
 *   amount (smallest unit, legacy) — used as fallback if humanAmount not provided
 */
quoteRouter.get("/quote", async (req: Request, res: Response) => {
    try {
        const { inputMint, outputMint, humanAmount, amount: rawAmount } =
            req.query as Record<string, string>;

        if (!inputMint || !outputMint || (!humanAmount && !rawAmount)) {
            res.status(400).json({ error: "Missing required params: inputMint, outputMint, humanAmount (or amount)" });
            return;
        }

        // Look up decimals from the authoritative Jupiter token list
        const inputDecimals = await getTokenDecimals(inputMint);
        const outputDecimals = await getTokenDecimals(outputMint);

        // Convert human-readable amount to smallest units using server-side decimals
        let amountSmallest: string;
        let humanAmountNum: number;

        if (humanAmount) {
            humanAmountNum = parseFloat(humanAmount);
            if (!Number.isFinite(humanAmountNum) || humanAmountNum <= 0) {
                res.status(400).json({ error: "Invalid amount: must be a positive number" });
                return;
            }
            amountSmallest = BigInt(Math.round(humanAmountNum * 10 ** inputDecimals)).toString();
        } else {
            // Legacy path: amount already in smallest units
            amountSmallest = rawAmount;
            humanAmountNum = Number(rawAmount) / 10 ** inputDecimals;
            if (!Number.isFinite(humanAmountNum) || humanAmountNum <= 0) {
                res.status(400).json({ error: "Invalid amount" });
                return;
            }
        }

        // Get quote from Jupiter
        const quote = await getQuote({ inputMint, outputMint, amount: amountSmallest });

        const outFormatted = formatTokenAmount(quote.outAmount, outputDecimals);
        const feeAmount = quote.platformFee?.amount ?? "0";
        const feeFormatted = formatTokenAmount(feeAmount, outputDecimals);
        const priceImpact = parseFloat(quote.priceImpactPct);

        // Fetch USD prices (now fixed to use Jupiter Price API v2)
        const [inputPriceUsd, outputPriceUsd] = await Promise.all([
            getTokenPriceUsd(inputMint),
            getTokenPriceUsd(outputMint),
        ]);

        const outputTokens = Number(quote.outAmount) / 10 ** outputDecimals;
        const inputUsdValue = inputPriceUsd !== null ? humanAmountNum * inputPriceUsd : null;
        const outputUsdValue = outputPriceUsd !== null ? outputTokens * outputPriceUsd : null;
        const exchangeRate = humanAmountNum > 0 ? outputTokens / humanAmountNum : 0;
        const estimatedFee = await estimateFeeUsd({ outputMint, feeAmount, outputDecimals });

        res.json({
            quote, // Raw quote for swap building
            display: {
                inputAmount: humanAmountNum,
                outputAmount: outFormatted,
                outputTokens,
                exchangeRate,
                feeAmount: feeFormatted,
                feeUsd: estimatedFee,
                inputUsd: inputUsdValue,
                outputUsd: outputUsdValue,
                priceImpactPct: priceImpact,
                slippageBps: quote.slippageBps,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Quote API error:", message);

        if (message.includes("No routes found") || message.includes("404")) {
            res.status(404).json({ error: "No swap route found for this pair" });
        } else {
            res.status(500).json({ error: "Failed to get swap quote" });
        }
    }
});
