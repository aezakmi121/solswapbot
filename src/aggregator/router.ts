import { getQuote } from "../jupiter/quote";
import { getLiFiQuote } from "./lifi";
import { isCrossChainSwap, findToken, getChain, CHAINS } from "./chains";
import { config } from "../config";

/**
 * Smart router: automatically picks Jupiter (same-chain) or LI.FI (cross-chain)
 * based on the input/output chain pair.
 *
 * Revenue:
 *   - Same-chain (Jupiter): platformFeeBps collected on-chain
 *   - Cross-chain (LI.FI): integrator fee via LI.FI partner portal
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
    provider: "jupiter" | "lifi";
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
    rawQuote: any;            // Jupiter QuoteResponse or LI.FI quote
    transactionRequest?: any; // LI.FI transaction data (ready to sign)

    error: string | null;
}

/**
 * Get the best route for a swap, automatically selecting Jupiter or LI.FI.
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
            outputAmountUsd: "0",
            feeUsd: "0",
            estimatedTimeSeconds: 15,
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

// ─── Cross-Chain (LI.FI) ───────────────────────────────────────────
async function getCrossChainQuote(req: RouteQuoteRequest): Promise<RouteQuoteResult> {
    try {
        const inputTokenInfo = findToken(req.inputToken, req.inputChain);
        const outputTokenInfo = findToken(req.outputToken, req.outputChain);

        if (!inputTokenInfo || !outputTokenInfo) {
            return {
                provider: "lifi",
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
                provider: "lifi",
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

        // Convert human amount to smallest unit for LI.FI
        const amountInSmallestUnit = Math.round(
            parseFloat(req.amount) * Math.pow(10, inputTokenInfo.decimals)
        ).toString();

        const lifiResult = await getLiFiQuote({
            fromChain: inputChainInfo.lifiChainKey,
            toChain: outputChainInfo.lifiChainKey,
            fromToken: inputTokenInfo.address,
            toToken: outputTokenInfo.address,
            fromAmount: amountInSmallestUnit,
            slippage: (req.slippageBps ?? 50) / 10000, // BPS to decimal
        });

        if (lifiResult.error) {
            return {
                provider: "lifi",
                isCrossChain: true,
                inputChain: req.inputChain,
                outputChain: req.outputChain,
                inputAmount: req.amount,
                outputAmount: "0",
                outputAmountUsd: "0",
                feeUsd: "0",
                estimatedTimeSeconds: 0,
                rawQuote: null,
                error: lifiResult.error,
            };
        }

        return {
            provider: "lifi",
            isCrossChain: true,
            inputChain: req.inputChain,
            outputChain: req.outputChain,
            inputAmount: req.amount,
            outputAmount: lifiResult.toAmount,
            outputAmountUsd: lifiResult.toAmountUsd,
            feeUsd: lifiResult.gasCostUsd,
            estimatedTimeSeconds: lifiResult.estimatedTimeInSeconds,
            rawQuote: lifiResult,
            transactionRequest: lifiResult.transactionRequest,
            error: null,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
            provider: "lifi",
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
