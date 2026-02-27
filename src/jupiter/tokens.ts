import { withRetry } from "../utils/retry";
import { config } from "../config";

/** Token info from Jupiter Token API */
export interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string | null;
}

/** In-memory cache for the Jupiter strict token list */
let cachedTokens: JupiterToken[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** In-flight refresh promise — prevents thundering herd on cache expiry (M4) */
let pendingLoad: Promise<JupiterToken[]> | null = null;

/** Popular tokens shown by default (in this order) */
const POPULAR_MINTS = new Set([
  "So11111111111111111111111111111111111111112",   // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  // USDT
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  // JUP
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH (Wormhole)
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  // mSOL
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", // jitoSOL
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",  // RENDER
]);

/** Hardcoded fallback so the app works even if Jupiter token API is down */
const FALLBACK_TOKENS: JupiterToken[] = [
  { address: "So11111111111111111111111111111111111111112",   symbol: "SOL",    name: "Wrapped SOL",   decimals: 9,  logoURI: null },
  { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC",   name: "USD Coin",      decimals: 6,  logoURI: null },
  { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  symbol: "USDT",   name: "USDT",          decimals: 6,  logoURI: null },
  { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK",   name: "Bonk",          decimals: 5,  logoURI: null },
  { address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF",    name: "dogwifhat",     decimals: 6,  logoURI: null },
  { address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  symbol: "JUP",    name: "Jupiter",       decimals: 6,  logoURI: null },
  { address: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", symbol: "ETH",    name: "Ether (Wormhole)", decimals: 8, logoURI: null },
  { address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  symbol: "mSOL",   name: "Marinade SOL",  decimals: 9,  logoURI: null },
  { address: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", symbol: "jitoSOL",name: "Jito SOL",      decimals: 9,  logoURI: null },
  { address: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",  symbol: "RENDER", name: "Render Token",  decimals: 8,  logoURI: null },
];

/** Jupiter Tokens API V2 — derives base from JUPITER_API_URL (e.g. https://api.jup.ag) */
function getTokenListUrl(): string {
  const base = config.JUPITER_API_URL.replace(/\/swap\/v1\/?$/, "");
  return `${base}/tokens/v2/tag?query=verified`;
}

/** Raw shape returned by Jupiter Tokens API V2 */
interface JupiterTokenV2 {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string | null;
}

/** Fetch and cache the Jupiter verified token list (V2) */
async function loadTokenList(): Promise<JupiterToken[]> {
  const now = Date.now();
  if (cachedTokens.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTokens;
  }

  // Return the in-flight promise if a refresh is already running (M4: thundering herd prevention)
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    try {
      const raw = await withRetry(async () => {
        const headers: Record<string, string> = {};
        if (config.JUPITER_API_KEY) headers["x-api-key"] = config.JUPITER_API_KEY;
        const res = await fetch(getTokenListUrl(), { headers });
        if (!res.ok) {
          throw new Error(`Jupiter token list failed (${res.status})`);
        }
        return res.json() as Promise<JupiterTokenV2[]>;
      }, { label: "Jupiter token list" });

      // Normalize V2 fields (id→address, icon→logoURI) to keep consumers unchanged
      const tokens: JupiterToken[] = raw.map((t) => ({
        address: t.id,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.icon,
      }));

      cachedTokens = tokens;
      cacheTimestamp = Date.now();
      return tokens;
    } catch (err) {
      console.error("Jupiter token list unavailable, using fallback:", (err as Error).message);
      // Return stale cache if available, otherwise hardcoded fallback
      return cachedTokens.length > 0 ? cachedTokens : FALLBACK_TOKENS;
    } finally {
      pendingLoad = null;
    }
  })();

  return pendingLoad;
}

/** Get the popular/default tokens list */
export async function getPopularTokens(): Promise<JupiterToken[]> {
  const all = await loadTokenList();
  const popular = all.filter((t) => POPULAR_MINTS.has(t.address));
  // Sort by the order in POPULAR_MINTS
  const mintOrder = [...POPULAR_MINTS];
  popular.sort((a, b) => mintOrder.indexOf(a.address) - mintOrder.indexOf(b.address));
  return popular;
}

/** Search tokens by symbol, name, or exact mint address */
export async function searchTokens(query: string, limit = 20): Promise<JupiterToken[]> {
  const all = await loadTokenList();
  const q = query.trim().toLowerCase();

  if (!q) return [];

  // Exact mint address match
  if (q.length >= 32) {
    const exact = all.find((t) => t.address.toLowerCase() === q);
    return exact ? [exact] : [];
  }

  // Score-based search: exact symbol match first, then prefix, then includes
  const results: { token: JupiterToken; score: number }[] = [];

  for (const token of all) {
    const sym = token.symbol.toLowerCase();
    const name = token.name.toLowerCase();

    if (sym === q) {
      results.push({ token, score: 0 });
    } else if (sym.startsWith(q)) {
      results.push({ token, score: 1 });
    } else if (name.startsWith(q)) {
      results.push({ token, score: 2 });
    } else if (sym.includes(q) || name.includes(q)) {
      results.push({ token, score: 3 });
    }
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit).map((r) => r.token);
}

/** Look up a single token by mint address */
export async function getTokenByMint(mint: string): Promise<JupiterToken | null> {
  const all = await loadTokenList();
  return all.find((t) => t.address === mint) ?? null;
}

/** Look up decimals for a mint address. Falls back to 9 (SOL default). */
export async function getTokenDecimals(mint: string): Promise<number> {
  const token = await getTokenByMint(mint);
  return token?.decimals ?? 9;
}

/** Batch look up metadata for multiple mints. Returns a map of mint → token (undefined if not found). */
export async function getTokensMetadata(
  mints: string[]
): Promise<Record<string, JupiterToken | undefined>> {
  const all = await loadTokenList();
  const byMint = new Map(all.map((t) => [t.address, t]));
  return Object.fromEntries(mints.map((m) => [m, byMint.get(m)]));
}
