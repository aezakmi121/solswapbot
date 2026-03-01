import { config } from "../config";

/**
 * Moralis EVM token balance fetcher.
 *
 * Fetches ERC20 + native token balances for a given EVM address across 5 chains
 * (Ethereum, BNB Chain, Polygon, Arbitrum, Base) using the Moralis REST API.
 *
 * Free tier: 120K CUs/month — more than sufficient for portfolio display.
 * API docs: https://docs.moralis.io/web3-data-api/evm/reference/wallet-api/get-wallet-token-balances-price
 *
 * Requires MORALIS_API_KEY in .env — feature is disabled (returns []) if not set.
 */

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

/** Stablecoin symbols whose price is effectively $1.00 */
const STABLECOINS = new Set(["USDC", "USDT", "DAI", "BUSD", "FRAX", "USDBC", "USDE", "LUSD"]);

const SUPPORTED_CHAINS = [
    { id: "eth",      name: "ethereum",  nativeSymbol: "ETH",   nativeName: "Ethereum",  nativeDecimals: 18 },
    { id: "bsc",      name: "bsc",       nativeSymbol: "BNB",   nativeName: "BNB",       nativeDecimals: 18 },
    { id: "polygon",  name: "polygon",   nativeSymbol: "MATIC", nativeName: "Polygon",   nativeDecimals: 18 },
    { id: "arbitrum", name: "arbitrum",  nativeSymbol: "ETH",   nativeName: "Ethereum",  nativeDecimals: 18 },
    { id: "base",     name: "base",      nativeSymbol: "ETH",   nativeName: "Ethereum",  nativeDecimals: 18 },
] as const;

export interface EvmToken {
    chain: string;      // "ethereum" | "bsc" | "polygon" | "arbitrum" | "base"
    symbol: string;
    name: string;
    icon: string | null;
    address: string;    // token contract address or "native"
    amount: number;
    decimals: number;
    priceUsd: number | null;
    valueUsd: number | null;
}

/** Parse a raw balance string (e.g. "1000000") into a human-readable number */
function parseBalance(raw: string, decimals: number): number {
    if (!raw || raw === "0") return 0;
    // Use string manipulation to avoid BigInt/float precision issues
    const padded = raw.padStart(decimals + 1, "0");
    const intPart = padded.slice(0, padded.length - decimals) || "0";
    const fracPart = padded.slice(padded.length - decimals);
    return parseFloat(`${intPart}.${fracPart}`);
}

async function fetchChainPortfolio(
    evmAddress: string,
    chain: typeof SUPPORTED_CHAINS[number],
    headers: Record<string, string>
): Promise<EvmToken[]> {
    // Fetch ERC20 tokens and native balance in parallel for this chain
    const [erc20Res, nativeRes] = await Promise.allSettled([
        fetch(`${MORALIS_BASE}/${evmAddress}/erc20?chain=${chain.id}`, { headers }),
        fetch(`${MORALIS_BASE}/${evmAddress}/balance?chain=${chain.id}`, { headers }),
    ]);

    const tokens: EvmToken[] = [];

    // ── Native token balance ──────────────────────────────────────────────────
    if (nativeRes.status === "fulfilled" && nativeRes.value.ok) {
        try {
            const native = await nativeRes.value.json() as { balance: string };
            const amount = parseBalance(native.balance || "0", chain.nativeDecimals);
            if (amount > 0.000001) {
                // Stablecoin price or null for native (price needs separate call)
                tokens.push({
                    chain: chain.name,
                    symbol: chain.nativeSymbol,
                    name: chain.nativeName,
                    icon: null,
                    address: "native",
                    amount,
                    decimals: chain.nativeDecimals,
                    priceUsd: null,
                    valueUsd: null,
                });
            }
        } catch {
            // non-fatal
        }
    }

    // ── ERC20 token balances ──────────────────────────────────────────────────
    if (erc20Res.status === "fulfilled" && erc20Res.value.ok) {
        try {
            const raw: any = await erc20Res.value.json();
            const items: any[] = Array.isArray(raw) ? raw : (raw.result ?? []);

            for (const t of items) {
                // Skip spam tokens flagged by Moralis
                if (t.possible_spam) continue;

                const decimals = parseInt(t.decimals ?? "18", 10);
                const amount = parseBalance(t.balance || "0", decimals);
                if (amount <= 0) continue;

                // Assign $1 price for known stablecoins (covers the main bridge-use case)
                const symbol = (t.symbol ?? "").toUpperCase();
                const priceUsd = STABLECOINS.has(symbol) ? 1.0 : null;

                tokens.push({
                    chain: chain.name,
                    symbol: t.symbol ?? "?",
                    name: t.name ?? "Unknown Token",
                    icon: t.logo ?? t.thumbnail ?? null,
                    address: t.token_address ?? "",
                    amount,
                    decimals,
                    priceUsd,
                    valueUsd: priceUsd !== null ? amount * priceUsd : null,
                });
            }
        } catch {
            // non-fatal
        }
    }

    return tokens;
}

/**
 * Fetch EVM token portfolio for an address across all supported chains.
 * Returns [] if MORALIS_API_KEY is not configured.
 * Filters out zero-balance tokens and spam.
 */
export async function getEvmPortfolio(evmAddress: string): Promise<EvmToken[]> {
    const apiKey = config.MORALIS_API_KEY;
    if (!apiKey) return [];

    const headers = {
        "X-API-Key": apiKey,
        "Accept": "application/json",
    };

    try {
        // Fetch all chains in parallel — each chain is 2 calls (ERC20 + native)
        const results = await Promise.allSettled(
            SUPPORTED_CHAINS.map((chain) => fetchChainPortfolio(evmAddress, chain, headers))
        );

        const allTokens: EvmToken[] = [];
        for (const result of results) {
            if (result.status === "fulfilled") {
                allTokens.push(...result.value);
            }
        }

        return allTokens;
    } catch (err) {
        console.error("EVM portfolio fetch error:", err);
        return [];
    }
}
