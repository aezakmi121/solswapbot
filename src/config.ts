import "dotenv/config";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

const envSchema = z.object({
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),

  // Solana
  SOLANA_RPC_URL: z.string().url("SOLANA_RPC_URL must be a valid URL"),
  FEE_WALLET_ADDRESS: z
    .string()
    .min(32, "FEE_WALLET_ADDRESS must be a valid Solana address")
    .max(44, "FEE_WALLET_ADDRESS must be a valid Solana address")
    .refine((addr) => {
      try { new PublicKey(addr); return true; } catch { return false; }
    }, "FEE_WALLET_ADDRESS must be a valid Solana public key"),

  // Jupiter (Solana DEX)
  JUPITER_API_URL: z
    .string()
    .url()
    .default("https://api.jup.ag/swap/v1"),
  JUPITER_API_KEY: z.string().optional(), // Get free key at portal.jup.ag — required after lite-api sunset
  PLATFORM_FEE_BPS: z.coerce
    .number()
    .int()
    .min(0)
    .max(200)
    .default(50),

  // Privy (Embedded Wallets)
  PRIVY_APP_ID: z.string().optional(),

  // LI.FI (Cross-Chain) — optional, works without key but key enables higher limits + fees
  LIFI_API_KEY: z.string().optional(),

  // Helius (Webhooks + Enhanced RPC)
  HELIUS_API_KEY: z.string().optional(),
  HELIUS_WEBHOOK_SECRET: z.string().optional(),

  // Moralis (EVM token balances — free tier: 120K CUs/month)
  MORALIS_API_KEY: z.string().optional(),

  // AI Signals
  GEMINI_API_KEY: z.string().optional(),

  // App
  NODE_ENV: z
    .enum(["development", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  // API Server (for Mini App)
  API_PORT: z.coerce.number().int().default(3001),
  CORS_ORIGIN: z.string().default("*").refine(
    (val) => !(process.env.NODE_ENV === "production" && val === "*"),
    "CORS_ORIGIN must not be '*' in production — set it to your Vercel deployment URL"
  ),
  MINIAPP_URL: z.string().url().optional(),

  // Referral
  REFERRAL_FEE_SHARE_PERCENT: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(25),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
