import { config } from "../config";

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
            // LI.FI requires fromAddress — use chain-appropriate dummy for quote-only
            fromAddress: req.fromAddress ?? (req.fromChain === "1151111081099710"
                ? "GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSMQRdW"  // dummy Solana address
                : "0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0"),  // dummy EVM address
            toAddress: req.toAddress ?? (req.toChain === "1151111081099710"
                ? "GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSMQRdW"
                : "0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0"),
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
                error: errorMessage,
            };
        };

        const data = await response.json() as any;

        return {
            id: data.id ?? "",
            type: data.type ?? "",
            fromChainId: data.action?.fromChainId?.toString() ?? req.fromChain,
            toChainId: data.action?.toChainId?.toString() ?? req.toChain,
            fromAmount: data.action?.fromAmount ?? req.fromAmount,
            toAmount: data.estimate?.toAmount ?? "0",
            toAmountUsd: data.estimate?.toAmountUSD ?? "0",
            gasCostUsd: data.estimate?.gasCosts?.[0]?.amountUSD ?? "0",
            estimatedTimeInSeconds: data.estimate?.executionDuration ?? 60,
            steps: (data.includedSteps ?? []).map((step: any) => ({
                type: step.type ?? "swap",
                tool: step.tool ?? "unknown",
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
            transactionRequest: data.transactionRequest ?? null,
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
