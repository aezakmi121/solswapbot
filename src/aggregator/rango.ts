import { config } from "../config";
import { CHAINS } from "./chains";

/**
 * Rango API client for cross-chain swap routing.
 *
 * Rango handles: bridging, DEX routing, multi-step swaps across chains.
 * Revenue: Rango pays affiliate fees monthly based on our referral volume.
 *
 * API docs: https://docs.rango.exchange/
 */

const RANGO_BASE_URL = "https://api.rango.exchange";

export interface RangoQuoteRequest {
    from: { blockchain: string; symbol: string; address: string };
    to: { blockchain: string; symbol: string; address: string };
    amount: string;
    slippage: string;
}

export interface RangoRouteFee {
    name: string;
    amount: string;
    usdPrice: number;
}

export interface RangoRouteStep {
    from: { blockchain: string; symbol: string };
    to: { blockchain: string; symbol: string };
    swapperType: string;
    estimatedTimeInSeconds: number;
}

export interface RangoQuoteResult {
    requestId: string;
    resultType: "OK" | "NO_ROUTE" | "INPUT_LIMIT_ISSUE";
    route: {
        outputAmount: string;
        outputAmountUsd: string;
        feeUsd: string;
        estimatedTimeInSeconds: number;
        steps: RangoRouteStep[];
    } | null;
    error: string | null;
}

/**
 * Get a cross-chain swap quote from Rango.
 * Returns the best route across bridges and DEXes.
 */
export async function getRangoQuote(req: RangoQuoteRequest): Promise<RangoQuoteResult> {
    const apiKey = config.RANGO_API_KEY;

    if (!apiKey) {
        return {
            requestId: "",
            resultType: "NO_ROUTE",
            route: null,
            error: "RANGO_API_KEY not configured",
        };
    }

    try {
        const params = new URLSearchParams({
            apiKey,
            from: `${req.from.blockchain}.${req.from.symbol}--${req.from.address}`,
            to: `${req.to.blockchain}.${req.to.symbol}--${req.to.address}`,
            amount: req.amount,
            slippage: req.slippage,
            affiliateRef: "solswap", // Our affiliate ID for revenue
        });

        const response = await fetch(`${RANGO_BASE_URL}/basic/quote?${params}`);

        if (!response.ok) {
            const text = await response.text();
            console.error("Rango quote error:", response.status, text);
            return {
                requestId: "",
                resultType: "NO_ROUTE",
                route: null,
                error: `Rango API error: ${response.status}`,
            };
        }

        const data = await response.json() as any;

        if (data.resultType !== "OK" || !data.route) {
            return {
                requestId: data.requestId ?? "",
                resultType: data.resultType ?? "NO_ROUTE",
                route: null,
                error: data.error ?? "No route found",
            };
        }

        return {
            requestId: data.requestId,
            resultType: "OK",
            route: {
                outputAmount: data.route.outputAmount,
                outputAmountUsd: data.route.outputAmountUsd ?? "0",
                feeUsd: data.route.feeUsd ?? "0",
                estimatedTimeInSeconds: data.route.estimatedTimeInSeconds ?? 60,
                steps: (data.route.path ?? []).map((step: any) => ({
                    from: { blockchain: step.from?.blockchain ?? "", symbol: step.from?.symbol ?? "" },
                    to: { blockchain: step.to?.blockchain ?? "", symbol: step.to?.symbol ?? "" },
                    swapperType: step.swapperType ?? "DEX",
                    estimatedTimeInSeconds: step.estimatedTimeInSeconds ?? 30,
                })),
            },
            error: null,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Rango quote fetch error:", message);
        return {
            requestId: "",
            resultType: "NO_ROUTE",
            route: null,
            error: message,
        };
    }
}

/**
 * Build a cross-chain swap transaction via Rango.
 * Returns the transaction data for the user to sign.
 */
export async function buildRangoSwap(params: {
    requestId: string;
    userWalletAddress: string;        // Source chain wallet
    destinationWalletAddress: string; // Destination chain wallet
}): Promise<{ tx: any; error: string | null }> {
    const apiKey = config.RANGO_API_KEY;

    if (!apiKey) {
        return { tx: null, error: "RANGO_API_KEY not configured" };
    }

    try {
        const response = await fetch(`${RANGO_BASE_URL}/basic/swap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                apiKey,
                requestId: params.requestId,
                userWalletAddress: params.userWalletAddress,
                destinationWalletAddress: params.destinationWalletAddress,
            }),
        });

        if (!response.ok) {
            return { tx: null, error: `Rango swap error: ${response.status}` };
        }

        const data = await response.json() as any;

        if (data.error) {
            return { tx: null, error: data.error };
        }

        return { tx: data.tx, error: null };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { tx: null, error: message };
    }
}
