import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { config } from "../config";
import { withRetry } from "../utils/retry";
import { QuoteResponse } from "./quote";

/** Zod schema for Jupiter swap response */
const swapResponseSchema = z.object({
  swapTransaction: z.string(),
  lastValidBlockHeight: z.number(),
  prioritizationFeeLamports: z.union([z.number(), z.record(z.unknown())]).optional(),
});

export type SwapResponse = z.infer<typeof swapResponseSchema>;

/** Build a swap transaction via Jupiter. Returns a base64 serialized transaction. Retries on transient errors. */
export async function buildSwapTransaction(params: {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
}): Promise<SwapResponse> {
  return withRetry(async () => {
    const url = `${config.JUPITER_API_URL}/swap`;

    // Derive the Associated Token Account (ATA) for the output mint on our fee wallet.
    // Jupiter requires the fee account to be a token account, not a raw wallet address.
    const outputMint = new PublicKey(params.quoteResponse.outputMint);
    const feeWallet = new PublicKey(config.FEE_WALLET_ADDRESS);
    const feeAccount = getAssociatedTokenAddressSync(outputMint, feeWallet, true);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.JUPITER_API_KEY) headers["x-api-key"] = config.JUPITER_API_KEY;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        feeAccount: feeAccount.toBase58(),
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
  }, { label: "Jupiter swap" });
}
