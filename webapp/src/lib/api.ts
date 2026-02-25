const API_BASE = import.meta.env.VITE_API_URL || "";

// Telegram WebApp SDK — used for authenticated API calls
const tg = (window as any).Telegram?.WebApp;

/**
 * Get auth headers for authenticated API calls.
 * Sends the signed initData string (not initDataUnsafe) so the backend
 * can verify the HMAC signature and extract the telegramId securely (C2/C5).
 */
function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const initData = tg?.initData;
    if (initData) {
        headers["Authorization"] = `tma ${initData}`;
    }
    return headers;
}

/** Token info returned by the backend (sourced from Jupiter) */
export interface TokenInfo {
    symbol: string;
    name: string;
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
    quote: any;
    display: QuoteDisplay;
}

export interface UserData {
    telegramId: string;
    walletAddress: string | null;
    solBalance: number | null;
    message?: string;
}

export interface TokenBalance {
    mint: string;
    amount: number;
    decimals: number;
}

export interface SwapRecord {
    id: string;
    inputMint: string;
    outputMint: string;
    inputSymbol: string;
    outputSymbol: string;
    inputAmount: string;
    outputAmount: string;
    feeAmountUsd: number | null;
    txSignature: string | null;
    status: string;
    createdAt: string;
}

/** Fetch popular tokens (SOL, USDC, etc.) from backend (Jupiter-sourced) */
export async function fetchPopularTokens(): Promise<TokenInfo[]> {
    const res = await fetch(`${API_BASE}/api/tokens`);
    if (!res.ok) {
        throw new Error("Failed to fetch tokens");
    }
    const data = await res.json();
    return data.tokens;
}

/** Search tokens by symbol, name, or mint address */
export async function searchTokens(query: string): Promise<TokenInfo[]> {
    const res = await fetch(
        `${API_BASE}/api/tokens/search?query=${encodeURIComponent(query)}`
    );
    if (!res.ok) {
        throw new Error("Failed to search tokens");
    }
    const data = await res.json();
    return data.tokens;
}

export async function fetchUser(): Promise<UserData> {
    const res = await fetch(`${API_BASE}/api/user`, {
        headers: getAuthHeaders(),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch user");
    }
    return res.json();
}

export async function fetchQuote(params: {
    inputMint: string;
    outputMint: string;
    humanAmount: string;
}): Promise<QuoteResponse> {
    const searchParams = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        humanAmount: params.humanAmount,
    });
    const res = await fetch(`${API_BASE}/api/quote?${searchParams}`, {
        headers: getAuthHeaders(),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to get quote");
    }
    return res.json();
}

export async function fetchSwapTransaction(params: {
    quoteResponse: any;
    userPublicKey: string;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
    const res = await fetch(`${API_BASE}/api/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to build swap");
    }
    return res.json();
}

/** Save a Privy-managed wallet address to the user's account */
export async function saveWalletAddress(
    walletAddress: string
): Promise<void> {
    const res = await fetch(`${API_BASE}/api/user/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ walletAddress }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to save wallet");
    }
}

/** Fetch swap history for a user */
export async function fetchHistory(): Promise<SwapRecord[]> {
    const res = await fetch(`${API_BASE}/api/history`, {
        headers: getAuthHeaders(),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to fetch history");
    }
    const data = await res.json();
    return data.swaps;
}

/** Confirm a swap after the user signs — records in DB and starts on-chain polling */
export async function confirmSwap(params: {
    txSignature: string;
    inputMint: string;
    outputMint: string;
    inputAmount: string;
    outputAmount: string;
    feeAmountUsd?: number | null;
}): Promise<{ swapId: string; status: string }> {
    const res = await fetch(`${API_BASE}/api/swap/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to confirm swap");
    }
    return res.json();
}

/** Poll swap confirmation status */
export async function fetchSwapStatus(
    swapId: string
): Promise<{ swapId: string; status: string; txSignature: string | null }> {
    const res = await fetch(`${API_BASE}/api/swap/status?swapId=${encodeURIComponent(swapId)}`, {
        headers: getAuthHeaders(),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Failed to fetch swap status");
    }
    return res.json();
}

/** Fetch SOL + SPL token balances for a wallet */
export async function fetchBalances(walletAddress: string): Promise<TokenBalance[]> {
    const res = await fetch(
        `${API_BASE}/api/user/balances?walletAddress=${encodeURIComponent(walletAddress)}`,
        { headers: getAuthHeaders() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.balances ?? [];
}
