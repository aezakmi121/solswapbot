import { getQuote } from "../jupiter/quote";
import { buildSwapTransaction } from "../jupiter/swap";
import { getRangoQuote, buildRangoSwap, RangoQuoteResult } from "./rango";
import { isCrossChainSwap, findToken, getChain, CHAINS } from "./chains";
import { config } from "../config";

/**
 * Smart router: automatically picks Jupiter (same-chain) or Rango (cross-chain)
 * based on the input/output chain pair.
 *
 * Revenue:
 *   - Same-chain (Jupiter): platformFeeBps collected on-chain
 *   - Cross-chain (Rango): affiliate fee paid monthly by Rango
 */

export interface RouteQuoteRequest {
    inputToken: string;   // Symbol or mint address
    outputToken: string;  // Symbol or mint address
    inputChain: string;   // "solana", "ethereum", etc.
    outputChain: string;  // "solana", "ethereum", etc.
    amount: string;       // Human-readable amount (e.g. "1.5")
    slippageBps?: number;
}

export interface RouteQuoteResult {
    provider: "jupiter" | "rango";
    isCrossChain: boolean;
    inputChain: string;
    outputChain: string;

    // Quote data
    inputAmount: string;
    outputAmount: string;
    outputAmountUsd: string;
    feeUsd: string;
    estimatedTimeSeconds: number;

    // For building the actual swap transaction
    rawQuote: any;            // Jupiter QuoteResponse or Rango requestId
    rangoRequestId?: string;  // Only for cross-chain

    error: string | null;
}

/**
 * Get the best route for a swap, automatically selecting Jupiter or Rango.
 */
export async function getSmartQuote(req: RouteQuoteRequest): Promise<RouteQuoteResult> {
    const crossChain = isCrossChainSwap(req.inputChain, req.outputChain);

    if (crossChain) {
        return getCrossChainQuote(req);
    } else {
        return getSameChainQuote(req);
    }
}

// ─── Same-Chain (Jupiter) ───────────────────────────────────────────
async function getSameChainQuote(req: RouteQuoteRequest): Promise<RouteQuoteResult> {
    try {
        // Resolve token addresses
        const inputTokenInfo = findToken(req.inputToken, req.inputChain);
        const outputTokenInfo = findToken(req.outputToken, req.outputChain);

        const inputMint = inputTokenInfo?.address ?? req.inputToken;
        const outputMint = outputTokenInfo?.address ?? req.outputToken;
        const inputDecimals = inputTokenInfo?.decimals ?? 9;

        // Convert human amount to smallest unit
        const amountInSmallestUnit = Math.round(
            parseFloat(req.amount) * Math.pow(10, inputDecimals)
        ).toString();

        const quote = await getQuote({
            inputMint,
            outputMint,
            amount: amountInSmallestUnit,
            slippageBps: req.slippageBps ?? 50,
        });

        return {
            provider: "jupiter",
            isCrossChain: false,
            inputChain: req.inputChain,
            outputChain: req.outputChain,
            inputAmount: req.amount,
            outputAmount: quote.outAmount,
            outputAmountUsd: "0", // Jupiter doesn't include USD — Mini App calculates
            feeUsd: "0",
            estimatedTimeSeconds: 15, // Solana is fast
            rawQuote: quote,
            error: null,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
            provider: "jupiter",
            isCrossChain: false,
            inputChain: req.inputChain,
            outputChain: req.outputChain,
            inputAmount: req.amount,
            outputAmount: "0",
            outputAmountUsd: "0",
            feeUsd: "0",
            estimatedTimeSeconds: 0,
            rawQuote: null,
            error: message,
        };
    }
}

// ─── Cross-Chain (Rango) ────────────────────────────────────────────
async function getCrossChainQuote(req: RouteQuoteRequest): Promise<RouteQuoteResult> {
    try {
        const inputTokenInfo = findToken(req.inputToken, req.inputChain);
        const outputTokenInfo = findToken(req.outputToken, req.outputChain);

        if (!inputTokenInfo || !outputTokenInfo) {
            return {
                provider: "rango",
                isCrossChain: true,
                inputChain: req.inputChain,
                outputChain: req.outputChain,
                inputAmount: req.amount,
                outputAmount: "0",
                outputAmountUsd: "0",
                feeUsd: "0",
                estimatedTimeSeconds: 0,
                rawQuote: null,
                error: "Token not found in registry. Use a valid symbol or contract address.",
            };
        }

        const inputChainInfo = getChain(req.inputChain);
        const outputChainInfo = getChain(req.outputChain);

        if (!inputChainInfo || !outputChainInfo) {
            return {
                provider: "rango",
                isCrossChain: true,
                inputChain: req.inputChain,
                outputChain: req.outputChain,
                inputAmount: req.amount,
                outputAmount: "0",
                outputAmountUsd: "0",
                feeUsd: "0",
                estimatedTimeSeconds: 0,
                rawQuote: null,
                error: "Unsupported chain",
            };
        }

        const rangoResult = await getRangoQuote({
            from: {
                blockchain: inputChainInfo.rangoId,
                symbol: inputTokenInfo.symbol,
                address: inputTokenInfo.address,
            },
            to: {
                blockchain: outputChainInfo.rangoId,
                symbol: outputTokenInfo.symbol,
                address: outputTokenInfo.address,
            },
            amount: req.amount,
            slippage: ((req.slippageBps ?? 50) / 100).toString(), // BPS to percent
        });

        if (rangoResult.resultType !== "OK" || !rangoResult.route) {
            return {
                provider: "rango",
                isCrossChain: true,
                inputChain: req.inputChain,
                outputChain: req.outputChain,
                inputAmount: req.amount,
                outputAmount: "0",
                outputAmountUsd: "0",
                feeUsd: "0",
                estimatedTimeSeconds: 0,
                rawQuote: null,
                error: rangoResult.error ?? "No cross-chain route found",
            };
        }

        return {
            provider: "rango",
            isCrossChain: true,
            inputChain: req.inputChain,
            outputChain: req.outputChain,
            inputAmount: req.amount,
            outputAmount: rangoResult.route.outputAmount,
            outputAmountUsd: rangoResult.route.outputAmountUsd,
            feeUsd: rangoResult.route.feeUsd,
            estimatedTimeSeconds: rangoResult.route.estimatedTimeInSeconds,
            rawQuote: rangoResult,
            rangoRequestId: rangoResult.requestId,
            error: null,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
            provider: "rango",
            isCrossChain: true,
            inputChain: req.inputChain,
            outputChain: req.outputChain,
            inputAmount: req.amount,
            outputAmount: "0",
            outputAmountUsd: "0",
            feeUsd: "0",
            estimatedTimeSeconds: 0,
            rawQuote: null,
            error: message,
        };
    }
}
