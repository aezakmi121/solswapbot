import { withRetry } from "../utils/retry";

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

/** Jupiter Tokens API V2 (V1 was deprecated August 2025) */
const JUPITER_TOKEN_LIST_URL = "https://lite-api.jup.ag/tokens/v2/tag?query=verified";

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

  const raw = await withRetry(async () => {
    const res = await fetch(JUPITER_TOKEN_LIST_URL);
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
