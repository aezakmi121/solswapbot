const API_BASE = import.meta.env.VITE_API_URL || "";

/** Token info embedded directly — no API call needed */
export interface TokenInfo {
    symbol: string;
    name: string;
    mint: string;
    decimals: number;
    icon: string;
}

export const TOKENS: TokenInfo[] = [
    {
        symbol: "SOL",
        name: "Solana",
        mint: "So11111111111111111111111111111111111111112",
        decimals: 9,
        icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    },
    {
        symbol: "USDC",
        name: "USD Coin",
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6,
        icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    },
    {
        symbol: "USDT",
        name: "Tether",
        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        decimals: 6,
        icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
    },
    {
        symbol: "BONK",
        name: "Bonk",
        mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        decimals: 5,
        icon: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
    },
    {
        symbol: "WIF",
        name: "dogwifhat",
        mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
        decimals: 6,
        icon: "https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betiez7oz4nqp5utgt754.ipfs.nftstorage.link",
    },
    {
        symbol: "JUP",
        name: "Jupiter",
        mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        decimals: 6,
        icon: "https://static.jup.ag/jup/icon.png",
    },
];

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

export async function fetchUser(telegramId: string): Promise<UserData> {
    const res = await fetch(`${API_BASE}/api/user?telegramId=${telegramId}`);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch user");
    }
    return res.json();
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
    quoteResponse: any;
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
