import { config } from "../config";
import { MINT_TO_SYMBOL, TOKEN_DECIMALS } from "../utils/constants";

const JUPITER_PRICE_URL = "https://price.jup.ag/v4/price";

interface JupiterPriceData {
  id: string;
  price: number;
}

/**
 * Fetches the current USD price of a token via Jupiter price API.
 * Returns null if price is unavailable.
 */
export async function getTokenPriceUsd(mintAddress: string): Promise<number | null> {
  try {
    const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mintAddress}`);
    if (!response.ok) return null;

    const json = (await response.json()) as { data: Record<string, JupiterPriceData> };
    const priceInfo = json.data[mintAddress];
    return priceInfo?.price ?? null;
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
