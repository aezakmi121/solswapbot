import { config } from "../config";
import { MINT_TO_SYMBOL, TOKEN_DECIMALS } from "../utils/constants";

const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";

interface JupiterPriceV3Entry {
  usdPrice: number;
  decimals: number;
}

type JupiterPriceV3Response = Record<string, JupiterPriceV3Entry>;

/**
 * Fetches the current USD price of a token via Jupiter Price API v3.
 * Returns null if price is unavailable.
 */
export async function getTokenPriceUsd(mintAddress: string): Promise<number | null> {
  try {
    const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mintAddress}`);
    if (!response.ok) return null;

    const json = (await response.json()) as JupiterPriceV3Response;
    const priceInfo = json[mintAddress];
    return priceInfo?.usdPrice ?? null;
  } catch {
    return null;
  }
}

/**
 * Estimates the USD value of a platform fee for a given swap.
 * Uses the output token's price since the fee is taken from the output.
 */
export async function estimateFeeUsd(params: {
  outputMint: string;
  feeAmount: string;
}): Promise<number | null> {
  const price = await getTokenPriceUsd(params.outputMint);
  if (price === null) return null;

  const symbol = MINT_TO_SYMBOL[params.outputMint];
  const decimals = symbol ? (TOKEN_DECIMALS[symbol] ?? 9) : 9;
  const feeTokens = Number(params.feeAmount) / 10 ** decimals;

  return feeTokens * price;
}
