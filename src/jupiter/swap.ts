import { z } from "zod";
import { config } from "../config";
import { QuoteResponse } from "./quote";

/** Zod schema for Jupiter swap response */
const swapResponseSchema = z.object({
  swapTransaction: z.string(),
  lastValidBlockHeight: z.number(),
  prioritizationFeeLamports: z.number().optional(),
});

export type SwapResponse = z.infer<typeof swapResponseSchema>;

/** Build a swap transaction via Jupiter. Returns a base64 serialized transaction. */
export async function buildSwapTransaction(params: {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
}): Promise<SwapResponse> {
  const url = `${config.JUPITER_API_URL}/swap`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      feeAccount: config.FEE_WALLET_ADDRESS,
      wrapAndUnwrapSol: true,
      asLegacyTransaction: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jupiter swap build failed (${response.status}): ${body}`);
  }

  const raw: unknown = await response.json();
  return swapResponseSchema.parse(raw);
}
