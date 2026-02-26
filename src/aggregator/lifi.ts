import { z } from "zod";
import { config } from "../config";
import { withRetry } from "../utils/retry";

/**
 * LI.FI API client for cross-chain swap routing.
 *
 * LI.FI handles: bridging, DEX routing, multi-step swaps across 60+ chains.
 * Revenue: Set your own integrator fee via the LI.FI partner portal.
 * No API key required for basic usage. Key unlocks higher rate limits + fee collection.
 *
 * API docs: https://docs.li.fi/
 */

const LIFI_BASE_URL = "https://li.quest/v1";

export interface LiFiQuoteRequest {
    fromChain: string;      // Chain ID (e.g. "SOL", "ETH", "BSC")
    toChain: string;
    fromToken: string;      // Token address
    toToken: string;
    fromAmount: string;     // Amount in smallest unit
    fromAddress?: string;   // User's source wallet (optional for quotes)
    toAddress?: string;     // User's destination wallet (optional for quotes)
    slippage?: number;      // 0-1 (e.g. 0.005 = 0.5%)
}

export interface LiFiRouteStep {
    type: string;           // "swap", "cross", "lifi"
    tool: string;           // e.g. "jupiter", "allbridge", "wormhole"
    fromChain: string;
    toChain: string;
    fromToken: { symbol: string; address: string };
    toToken: { symbol: string; address: string };
    estimatedTimeInSeconds: number;
}

export interface LiFiQuoteResult {
    id: string;
    type: string;
    fromChainId: string;
    toChainId: string;
    fromAmount: string;
    toAmount: string;
    toAmountUsd: string;
    gasCostUsd: string;
    estimatedTimeInSeconds: number;
    steps: LiFiRouteStep[];
    transactionRequest?: any;  // The TX to sign (if fromAddress was provided)
    error: string | null;
}

// ─── Zod Schemas (M9) ───────────────────────────────────────────────────────

const lifiTokenSchema = z.object({
    symbol: z.string().default(""),
    address: z.string().default(""),
});

const lifiStepActionSchema = z.object({
    fromChainId: z.union([z.string(), z.number()]).optional(),
    toChainId: z.union([z.string(), z.number()]).optional(),
    fromToken: lifiTokenSchema.optional(),
    toToken: lifiTokenSchema.optional(),
});

const lifiStepEstimateSchema = z.object({
    executionDuration: z.number().optional(),
});

const lifiIncludedStepSchema = z.object({
    type: z.string().default("swap"),
    tool: z.string().default("unknown"),
    action: lifiStepActionSchema.optional(),
    estimate: lifiStepEstimateSchema.optional(),
});

const lifiGasCostSchema = z.object({
    amountUSD: z.string().optional(),
});

const lifiEstimateSchema = z.object({
    toAmount: z.string().optional(),
    toAmountUSD: z.string().optional(),
    gasCosts: z.array(lifiGasCostSchema).optional(),
    executionDuration: z.number().optional(),
});

const lifiActionSchema = z.object({
    fromChainId: z.union([z.string(), z.number()]).optional(),
    toChainId: z.union([z.string(), z.number()]).optional(),
    fromAmount: z.string().optional(),
});

const lifiQuoteResponseSchema = z.object({
    id: z.string().optional(),
    type: z.string().optional(),
    action: lifiActionSchema.optional(),
    estimate: lifiEstimateSchema.optional(),
    includedSteps: z.array(lifiIncludedStepSchema).optional(),
    transactionRequest: z.unknown().optional(),
});

// ─── API Client ─────────────────────────────────────────────────────────────

/**
 * Get a cross-chain swap quote from LI.FI.
 * Returns the best route across bridges and DEXes.
 * Works WITHOUT an API key for basic usage.
 */
export async function getLiFiQuote(req: LiFiQuoteRequest): Promise<LiFiQuoteResult> {
    try {
        const params = new URLSearchParams({
            fromChain: req.fromChain,
            toChain: req.toChain,
            fromToken: req.fromToken,
            toToken: req.toToken,
            fromAmount: req.fromAmount,
            // LI.FI requires fromAddress for route calculation.
            // When no real address is provided we use a well-known dummy.
            // These are NOT used for funds — they only affect routing logic (M14).
            fromAddress: req.fromAddress ?? (req.fromChain === "1151111081099710"
                ? "GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSMQRdW"  // dummy Solana address
                : "0x0000000000000000000000000000000000000001"),    // minimal EVM dummy
            toAddress: req.toAddress ?? (req.toChain === "1151111081099710"
                ? "GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSMQRdW"
                : "0x0000000000000000000000000000000000000001"),
        });

        if (req.slippage !== undefined) params.set("slippage", req.slippage.toString());

        // Add integrator tag for revenue (if API key is set)
        const apiKey = config.LIFI_API_KEY;
        if (apiKey) {
            params.set("integrator", "solswap");
        }

        const headers: Record<string, string> = {
            "Accept": "application/json",
        };
        if (apiKey) {
            headers["x-lifi-api-key"] = apiKey;
        }

        // Wrap in retry for transient errors (M10)
        const data = await withRetry(async () => {
            const response = await fetch(`${LIFI_BASE_URL}/quote?${params}`, { headers });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("LI.FI quote error:", response.status, errorBody);

                // Parse error message if possible
                let errorMessage = `LI.FI API error: ${response.status}`;
                try {
                    const parsed = JSON.parse(errorBody);
                    errorMessage = parsed.message || parsed.error || errorMessage;
                } catch { }

                // Attach status code to make it retryable by withRetry (M25-compatible)
                const err = new Error(errorMessage) as Error & { status?: number };
                err.status = response.status;
                throw err;
            }

            return response.json();
        }, { label: "LI.FI quote" });

        // Validate and parse with Zod (M9)
        const parsed = lifiQuoteResponseSchema.parse(data);

        // Sum ALL gas cost entries (not just index [0]) (M13)
        const totalGasCostUsd = (parsed.estimate?.gasCosts ?? [])
            .reduce((sum, g) => sum + parseFloat(g.amountUSD ?? "0"), 0)
            .toFixed(4);

        return {
            id: parsed.id ?? "",
            type: parsed.type ?? "",
            fromChainId: parsed.action?.fromChainId?.toString() ?? req.fromChain,
            toChainId: parsed.action?.toChainId?.toString() ?? req.toChain,
            fromAmount: parsed.action?.fromAmount ?? req.fromAmount,
            toAmount: parsed.estimate?.toAmount ?? "0",
            toAmountUsd: parsed.estimate?.toAmountUSD ?? "0",
            gasCostUsd: totalGasCostUsd,
            estimatedTimeInSeconds: parsed.estimate?.executionDuration ?? 60,
            steps: (parsed.includedSteps ?? []).map((step) => ({
                type: step.type,
                tool: step.tool,
                fromChain: step.action?.fromChainId?.toString() ?? "",
                toChain: step.action?.toChainId?.toString() ?? "",
                fromToken: {
                    symbol: step.action?.fromToken?.symbol ?? "",
                    address: step.action?.fromToken?.address ?? "",
                },
                toToken: {
                    symbol: step.action?.toToken?.symbol ?? "",
                    address: step.action?.toToken?.address ?? "",
                },
                estimatedTimeInSeconds: step.estimate?.executionDuration ?? 30,
            })),
            transactionRequest: (parsed.transactionRequest as any) ?? null,
            error: null,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("LI.FI quote fetch error:", message);
        return {
            id: "",
            type: "",
            fromChainId: req.fromChain,
            toChainId: req.toChain,
            fromAmount: req.fromAmount,
            toAmount: "0",
            toAmountUsd: "0",
            gasCostUsd: "0",
            estimatedTimeInSeconds: 0,
            steps: [],
            error: message,
        };
    }
}

/**
 * Get supported chains from LI.FI.
 */
export async function getLiFiChains(): Promise<any[]> {
    try {
        const response = await fetch(`${LIFI_BASE_URL}/chains`);
        if (!response.ok) return [];
        const data = await response.json() as any;
        return data.chains ?? [];
    } catch {
        return [];
    }
}
