const JUPITER_PRICE_URL = "https://api.jup.ag/price/v2";

interface JupiterPriceV2Response {
  data: Record<string, { id: string; type: string; price: string } | undefined>;
  timeTaken?: number;
}

/**
 * Fetches the current USD price of a token via Jupiter Price API v2.
 * Returns null if price is unavailable.
 */
export async function getTokenPriceUsd(mintAddress: string): Promise<number | null> {
  try {
    const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mintAddress}`);
    if (!response.ok) return null;

    const json = (await response.json()) as JupiterPriceV2Response;
    const entry = json.data?.[mintAddress];
    if (!entry?.price) return null;

    const price = parseFloat(entry.price);
    return Number.isFinite(price) ? price : null;
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
