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

  // Jupiter
  JUPITER_API_URL: z
    .string()
    .url()
    .default("https://quote-api.jup.ag/v6"),
  PLATFORM_FEE_BPS: z.coerce
    .number()
    .int()
    .min(0)
    .max(200)
    .default(50),

  // App
  NODE_ENV: z
    .enum(["development", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

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
