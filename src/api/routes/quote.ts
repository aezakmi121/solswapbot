import { Router, Request, Response } from "express";
import { getQuote } from "../../jupiter/quote";
import { getTokenPriceUsd, estimateFeeUsd } from "../../jupiter/price";
import { TOKEN_DECIMALS } from "../../utils/constants";
import { formatTokenAmount } from "../../utils/formatting";

export const quoteRouter = Router();

/**
 * GET /api/quote
 * Fetches a swap quote from Jupiter with full USD breakdown.
 *
 * Query params: inputMint, outputMint, amount (smallest unit), inputSymbol, outputSymbol
 */
quoteRouter.get("/quote", async (req: Request, res: Response) => {
    try {
        const { inputMint, outputMint, amount, inputSymbol, outputSymbol } =
            req.query as Record<string, string>;

        if (!inputMint || !outputMint || !amount) {
            res.status(400).json({ error: "Missing required params: inputMint, outputMint, amount" });
            return;
        }

        // Get quote from Jupiter
        const quote = await getQuote({ inputMint, outputMint, amount });

        // Calculate display values
        const inSymbol = (inputSymbol ?? "").toUpperCase();
        const outSymbol = (outputSymbol ?? "").toUpperCase();
        const inputDecimals = TOKEN_DECIMALS[inSymbol] ?? 9;
        const outputDecimals = TOKEN_DECIMALS[outSymbol] ?? 9;

        const outFormatted = formatTokenAmount(quote.outAmount, outputDecimals);
        const feeAmount = quote.platformFee?.amount ?? "0";
        const feeFormatted = formatTokenAmount(feeAmount, outputDecimals);
        const priceImpact = parseFloat(quote.priceImpactPct);

        // Fetch USD prices
        const [inputPriceUsd, outputPriceUsd] = await Promise.all([
            getTokenPriceUsd(inputMint),
            getTokenPriceUsd(outputMint),
        ]);

        const inputAmount = Number(amount) / 10 ** inputDecimals;
        const outputTokens = Number(quote.outAmount) / 10 ** outputDecimals;
        const inputUsdValue = inputPriceUsd !== null ? inputAmount * inputPriceUsd : null;
        const outputUsdValue = outputPriceUsd !== null ? outputTokens * outputPriceUsd : null;
        const exchangeRate = outputTokens / inputAmount;
        const estimatedFee = await estimateFeeUsd({ outputMint, feeAmount });

        res.json({
            quote, // Raw quote for swap building
            display: {
                inputAmount,
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
