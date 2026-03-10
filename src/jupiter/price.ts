import { config } from "../config";

/** Jupiter Price API V3 — derives base from JUPITER_API_URL (e.g. https://api.jup.ag) */
function getPriceUrl(): string {
  const base = config.JUPITER_API_URL.replace(/\/swap\/v1\/?$/, "");
  return `${base}/price/v3/price`;
}

function jupiterHeaders(): Record<string, string> {
  return config.JUPITER_API_KEY ? { "x-api-key": config.JUPITER_API_KEY } : {};
}

interface JupiterPriceV3Entry {
  usdPrice: number;
  blockId?: number;
  decimals?: number;
  priceChange24h?: number;
}

type JupiterPriceV3Response = Record<string, JupiterPriceV3Entry | undefined>;

/**
 * Fetches the current USD price of a token via Jupiter Price API V3.
 * Returns null if price is unavailable.
 */
export async function getTokenPriceUsd(mintAddress: string): Promise<number | null> {
  try {
    const response = await fetch(`${getPriceUrl()}?ids=${mintAddress}`, { headers: jupiterHeaders() });
    if (!response.ok) return null;

    const json = (await response.json()) as JupiterPriceV3Response;
    const entry = json[mintAddress];
    if (!entry?.usdPrice) return null;

    return Number.isFinite(entry.usdPrice) ? entry.usdPrice : null;
  } catch {
    return null;
  }
}

/**
 * Batch-fetches USD prices for multiple token mints in a single API call.
 * Returns a map of mint → price (null if unavailable).
 */
export interface TokenPriceData {
  priceUsd: number | null;
  priceChange24h: number | null;
}

/**
 * Batch-fetches USD prices for multiple token mints in a single API call.
 * Returns a map of mint → TokenPriceData.
 */
export async function getTokenPricesBatch(
  mints: string[]
): Promise<Record<string, TokenPriceData>> {
  if (mints.length === 0) return {};
  try {
    const ids = mints.join(",");
    // Add showExtraInfo=true to get 24h price change data
    const response = await fetch(`${getPriceUrl()}?ids=${ids}&showExtraInfo=true`, { headers: jupiterHeaders() });
    
    if (!response.ok) {
      return Object.fromEntries(mints.map((m) => [m, { priceUsd: null, priceChange24h: null }]));
    }
    
    const json = (await response.json()) as JupiterPriceV3Response;
    const result: Record<string, TokenPriceData> = {};
    
    for (const mint of mints) {
      const entry = json[mint];
      const priceUsd = entry?.usdPrice && Number.isFinite(entry.usdPrice) ? entry.usdPrice : null;
      const priceChange24h = entry?.priceChange24h && Number.isFinite(entry.priceChange24h) ? entry.priceChange24h : null;
      result[mint] = { priceUsd, priceChange24h };
    }
    
    return result;
  } catch {
    return Object.fromEntries(mints.map((m) => [m, { priceUsd: null, priceChange24h: null }]));
  }
}

/**
 * Estimates the USD value of a platform fee for a given swap.
 * Accepts outputDecimals directly so we don't need hardcoded lookups.
 */
export async function estimateFeeUsd(params: {
  outputMint: string;
  feeAmount: string;
  outputDecimals?: number;
}): Promise<number | null> {
  const price = await getTokenPriceUsd(params.outputMint);
  if (price === null) return null;

  const decimals = params.outputDecimals ?? 9;
  const feeTokens = Number(params.feeAmount) / 10 ** decimals;

  return feeTokens * price;
}
