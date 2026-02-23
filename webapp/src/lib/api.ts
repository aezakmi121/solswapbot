const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface TokenInfo {
    symbol: string;
    mint: string;
    decimals: number;
    icon: string;
}

export interface QuoteDisplay {
    inputAmount: number;
    outputAmount: string;
    outputTokens: number;
    exchangeRate: number;
    feeAmount: string;
    feeUsd: number | null;
    inputUsd: number | null;
    outputUsd: number | null;
    priceImpactPct: number;
    slippageBps: number;
}

export interface QuoteResponse {
    quote: unknown; // Raw Jupiter quote for swap building
    display: QuoteDisplay;
}

export async function fetchTokens(): Promise<TokenInfo[]> {
    const res = await fetch(`${API_BASE}/api/tokens`);
    if (!res.ok) throw new Error("Failed to fetch tokens");
    const data = await res.json();
    return data.tokens;
}

export async function fetchQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    inputSymbol: string;
    outputSymbol: string;
}): Promise<QuoteResponse> {
    const searchParams = new URLSearchParams(params);
    const res = await fetch(`${API_BASE}/api/quote?${searchParams}`);
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to get quote");
    }
    return res.json();
}

export async function fetchSwapTransaction(params: {
    quoteResponse: unknown;
    userPublicKey: string;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
    const res = await fetch(`${API_BASE}/api/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to build swap");
    }
    return res.json();
}
