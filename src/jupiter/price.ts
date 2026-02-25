/** Jupiter Price API V3 (V2 deprecated — see dev.jup.ag/docs/price/v3) */
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3/price";

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
    const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mintAddress}`);
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
