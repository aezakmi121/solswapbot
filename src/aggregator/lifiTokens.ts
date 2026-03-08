import { CHAINS, CROSS_CHAIN_TOKENS, type TokenInfo } from "./chains";
import { config } from "../config";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedTokens {
    tokens: Map<string, TokenInfo[]>; // chainId → tokens
    lastFetch: number;
}

let cache: CachedTokens = { tokens: new Map(), lastFetch: 0 };

/**
 * Get tokens for a chain, preferring cached LI.FI data merged with our hardcoded list.
 *
 * Always includes the hardcoded tokens (guaranteed availability), then appends
 * any additional tokens discovered from LI.FI. Deduplicates by address.
 */
export async function getCachedTokens(chainId?: string): Promise<TokenInfo[]> {
    // Ensure cache is fresh
    if (Date.now() - cache.lastFetch > CACHE_TTL_MS) {
        await refreshCache().catch((err) => {
            console.error("LI.FI token cache refresh failed (using hardcoded):", err);
        });
    }

    if (chainId) {
        const hardcoded = CROSS_CHAIN_TOKENS.filter((t) => t.chainId === chainId.toLowerCase());
        const dynamic = cache.tokens.get(chainId.toLowerCase()) ?? [];
        return mergeTokens(hardcoded, dynamic);
    }

    // All chains
    const all: TokenInfo[] = [];
    for (const cId of Object.keys(CHAINS)) {
        const hardcoded = CROSS_CHAIN_TOKENS.filter((t) => t.chainId === cId);
        const dynamic = cache.tokens.get(cId) ?? [];
        all.push(...mergeTokens(hardcoded, dynamic));
    }
    return all;
}

/** Merge hardcoded + dynamic tokens, deduplicating by address (hardcoded wins) */
function mergeTokens(hardcoded: TokenInfo[], dynamic: TokenInfo[]): TokenInfo[] {
    const seen = new Set(hardcoded.map((t) => t.address.toLowerCase()));
    const merged = [...hardcoded];
    for (const t of dynamic) {
        if (!seen.has(t.address.toLowerCase())) {
            merged.push(t);
            seen.add(t.address.toLowerCase());
        }
    }
    return merged;
}

/** Fetch tokens from LI.FI API for all supported chains */
async function refreshCache(): Promise<void> {
    const chainEntries = Object.entries(CHAINS);
    const newTokens = new Map<string, TokenInfo[]>();

    // Fetch tokens for each chain in parallel
    await Promise.allSettled(
        chainEntries.map(async ([chainId, chainInfo]) => {
            try {
                const url = new URL("https://li.quest/v1/tokens");
                url.searchParams.set("chains", chainInfo.lifiChainId);

                const headers: Record<string, string> = { Accept: "application/json" };
                if ((config as any).LIFI_API_KEY) {
                    headers["x-lifi-api-key"] = (config as any).LIFI_API_KEY;
                }

                const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10_000) });
                if (!res.ok) return;

                const data = (await res.json()) as any;
                const tokensRaw = data.tokens?.[chainInfo.lifiChainId] ?? [];

                // Convert LI.FI format → our TokenInfo format
                const tokens: TokenInfo[] = tokensRaw
                    .filter((t: any) => t.address && t.symbol && t.decimals !== undefined)
                    .slice(0, 50) // cap at 50 per chain to avoid bloat
                    .map((t: any) => ({
                        symbol: t.symbol,
                        name: t.name ?? t.symbol,
                        chainId,
                        address: t.address,
                        decimals: t.decimals,
                        icon: chainInfo.icon, // Use chain icon as fallback
                    }));

                newTokens.set(chainId, tokens);
            } catch {
                // Individual chain failure is non-fatal
            }
        })
    );

    if (newTokens.size > 0) {
        cache = { tokens: newTokens, lastFetch: Date.now() };
        const total = Array.from(newTokens.values()).reduce((sum, t) => sum + t.length, 0);
        console.log(`LI.FI token cache refreshed: ${total} tokens across ${newTokens.size} chains`);
    }
}

/** Initialize the token cache at startup (non-blocking) */
export function initTokenCache(): void {
    refreshCache().catch((err) => {
        console.error("Initial LI.FI token cache failed (non-fatal):", err);
    });
}
