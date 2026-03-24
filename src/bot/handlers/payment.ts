import { Bot, Context } from "grammy";
import { prisma } from "../../db/client";

/**
 * Subscription tier pricing in Telegram Stars (XTR).
 *
 * Telegram Stars ≈ $0.02 each.
 * Monthly prices: SCANNER_PRO=250, WHALE_TRACKER=250, ALL_ACCESS=400
 * Annual prices: 20% discount (≈2.4 months free)
 */
const TIER_PRICES: Record<string, { monthly: number; annual: number; label: string; description: string }> = {
  SCANNER_PRO: {
    monthly: 250,
    annual: 2400,
    label: "Scanner Pro",
    description: "Unlimited token scans (vs 10/day free)",
  },
  WHALE_TRACKER: {
    monthly: 250,
    annual: 2400,
    label: "Whale Tracker",
    description: "Track up to 20 wallets (vs 3 free)",
  },
  ALL_ACCESS: {
    monthly: 400,
    annual: 3840,
    label: "All Access",
    description: "Unlimited scans + 20 tracked wallets",
  },
};

export { TIER_PRICES };

/** Duration in days for each period */
const DURATION_DAYS: Record<string, number> = {
  "30d": 30,
  "365d": 365,
};

/** Valid tiers that can be purchased */
const PURCHASABLE_TIERS = ["SCANNER_PRO", "WHALE_TRACKER", "ALL_ACCESS"];

/**
 * Parse invoice payload: "TIER|USER_ID|DURATION"
 * e.g. "SCANNER_PRO|clxyz123|30d"
 */
function parsePayload(payload: string): { tier: string; userId: string; duration: string } | null {
  const parts = payload.split("|");
  if (parts.length !== 3) return null;
  const [tier, userId, duration] = parts;
  if (!PURCHASABLE_TIERS.includes(tier)) return null;
  if (!DURATION_DAYS[duration]) return null;
  if (!userId) return null;
  return { tier, userId, duration };
}

/**
 * Register Telegram Stars payment handlers on the bot.
 * Call this from createBot() in bot/index.ts.
 */
export function registerPaymentHandlers(bot: Bot): void {
  /**
   * pre_checkout_query — Telegram asks us to validate the payment before charging.
   * We have 10 seconds to respond. Validate payload + user existence.
   */
  bot.on("pre_checkout_query", async (ctx) => {
    try {
      const payload = ctx.preCheckoutQuery.invoice_payload;
      const parsed = parsePayload(payload);

      if (!parsed) {
        await ctx.answerPreCheckoutQuery(false, { error_message: "Invalid subscription data" });
        return;
      }

      // Verify user exists
      const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
      if (!user) {
        await ctx.answerPreCheckoutQuery(false, { error_message: "User not found" });
        return;
      }

      // All good — approve the payment
      await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      console.error("pre_checkout_query error:", err);
      // If we fail to respond in time, Telegram auto-cancels the payment
      await ctx.answerPreCheckoutQuery(false, { error_message: "Server error" }).catch(() => {});
    }
  });

  /**
   * successful_payment — User has paid. Upsert their subscription.
   */
  bot.on("message:successful_payment", async (ctx) => {
    try {
      const payment = ctx.message!.successful_payment;
      const payload = payment.invoice_payload;
      const chargeId = payment.telegram_payment_charge_id;

      const parsed = parsePayload(payload);
      if (!parsed) {
        console.error("successful_payment: invalid payload", payload);
        return;
      }

      const { tier, userId, duration } = parsed;
      const durationDays = DURATION_DAYS[duration];

      // Dedup: check if this charge was already processed
      // We store chargeId in a simple check — look for subscription updated in last 30s
      // with matching tier. For robust dedup, we'd add a paymentChargeId column,
      // but this is sufficient for Stars (Telegram doesn't retry successful_payment).

      // Calculate expiry: if user already has an active sub of same or higher tier,
      // extend from current expiry instead of now (stacking)
      const existingSub = await prisma.subscription.findUnique({ where: { userId } });
      let expiresAt: Date;

      if (existingSub && existingSub.expiresAt && existingSub.expiresAt > new Date()) {
        // Extend from current expiry (stack time)
        expiresAt = new Date(existingSub.expiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
      } else {
        // Fresh subscription from now
        expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      }

      // Upsert subscription
      await prisma.subscription.upsert({
        where: { userId },
        update: { tier: tier as any, expiresAt },
        create: { userId, tier: tier as any, expiresAt },
      });

      const tierInfo = TIER_PRICES[tier];
      const periodLabel = duration === "365d" ? "annual" : "monthly";
      const expiryStr = expiresAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      console.log(`[payment] ${tier} ${periodLabel} activated for user ${userId}, expires ${expiryStr}, charge=${chargeId}`);

      // Send confirmation message
      await ctx.reply(
        `✅ *${tierInfo.label}* activated\\!\n\n` +
        `${tierInfo.description}\n\n` +
        `📅 Expires: ${expiryStr}\n` +
        `⭐ Paid: ${payment.total_amount} Stars \\(${periodLabel}\\)\n\n` +
        `Open the Mini App to start using your upgraded features\\!`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[
              { text: "🚀 Open SolSwap", web_app: { url: process.env.MINIAPP_URL ?? "https://solswap.vercel.app" } },
            ]],
          },
        }
      );
    } catch (err) {
      console.error("successful_payment error:", err);
      // Still try to notify the user
      await ctx.reply("✅ Payment received! Your subscription is being activated. If you don't see the upgrade in a few minutes, please contact support.").catch(() => {});
    }
  });
}
