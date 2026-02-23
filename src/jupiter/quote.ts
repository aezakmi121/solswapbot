import { z } from "zod";
import { config } from "../config";
import { withRetry } from "../utils/retry";

/** Zod schema for Jupiter quote response — validates unknown API data */
const platformFeeSchema = z.object({
  amount: z.string(),
  feeBps: z.number(),
});

const routeStepSchema = z.object({
  ammKey: z.string(),
  label: z.string().optional(),
  inputMint: z.string(),
  outputMint: z.string(),
  inAmount: z.string(),
  outAmount: z.string(),
  feeAmount: z.string(),
  feeMint: z.string(),
});

const routePlanSchema = z.object({
  swapInfo: routeStepSchema,
  percent: z.number(),
});

export const quoteResponseSchema = z.object({
  inputMint: z.string(),
  inAmount: z.string(),
  outputMint: z.string(),
  outAmount: z.string(),
  otherAmountThreshold: z.string(),
  swapMode: z.enum(["ExactIn", "ExactOut"]),
  slippageBps: z.number(),
  platformFee: platformFeeSchema.nullable().optional(),
  priceImpactPct: z.string(),
  routePlan: z.array(routePlanSchema),
  contextSlot: z.number().optional(),
  timeTaken: z.number().optional(),
});

export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

/** Fetch a swap quote from Jupiter with our platform fee baked in. Retries on transient errors. */
export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}): Promise<QuoteResponse> {
  return withRetry(async () => {
    const searchParams = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: String(params.slippageBps ?? 50),
      platformFeeBps: String(config.PLATFORM_FEE_BPS),
    });

    const url = `${config.JUPITER_API_URL}/quote?${searchParams}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jupiter quote failed (${response.status}): ${body}`);
    }

    const raw: unknown = await response.json();
    return quoteResponseSchema.parse(raw);
  }, { label: "Jupiter quote" });
}
