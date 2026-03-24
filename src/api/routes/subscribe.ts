import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { findUserByTelegramId } from "../../db/queries/users";
import { getBotInstance } from "../../bot/commands/start";
import { TIER_PRICES } from "../../bot/handlers/payment";

export const subscribeRouter = Router();

const VALID_TIERS = ["SCANNER_PRO", "WHALE_TRACKER", "ALL_ACCESS"];
const VALID_PERIODS = ["monthly", "annual"] as const;

/**
 * GET /api/user/subscription
 * Returns the current user's subscription status.
 */
subscribeRouter.get("/user/subscription", async (_req: Request, res: Response) => {
  try {
    const telegramId = res.locals.telegramId as string;
    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });

    if (!sub || sub.tier === "FREE") {
      res.json({ tier: "FREE", expiresAt: null, isActive: true });
      return;
    }

    const isExpired = sub.expiresAt && sub.expiresAt < new Date();

    res.json({
      tier: isExpired ? "FREE" : sub.tier,
      expiresAt: sub.expiresAt?.toISOString() ?? null,
      isActive: !isExpired,
      rawTier: sub.tier, // actual DB value (even if expired)
    });
  } catch (err) {
    console.error("GET /user/subscription error:", err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * POST /api/subscribe/invoice
 * Creates a Telegram Stars invoice link for a subscription tier.
 *
 * Body: { tier: "SCANNER_PRO" | "WHALE_TRACKER" | "ALL_ACCESS", period: "monthly" | "annual" }
 * Returns: { invoiceLink: string }
 */
subscribeRouter.post("/subscribe/invoice", async (req: Request, res: Response) => {
  try {
    const telegramId = res.locals.telegramId as string;
    const { tier, period } = req.body;

    // Validate inputs
    if (!tier || !VALID_TIERS.includes(tier)) {
      res.status(400).json({ error: `Invalid tier. Valid: ${VALID_TIERS.join(", ")}` });
      return;
    }
    if (!period || !VALID_PERIODS.includes(period)) {
      res.status(400).json({ error: `Invalid period. Valid: ${VALID_PERIODS.join(", ")}` });
      return;
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bot = getBotInstance();
    if (!bot) {
      res.status(503).json({ error: "Bot not available" });
      return;
    }

    const tierInfo = TIER_PRICES[tier];
    const amount = period === "annual" ? tierInfo.annual : tierInfo.monthly;
    const duration = period === "annual" ? "365d" : "30d";
    const payload = `${tier}|${user.id}|${duration}`;
    const periodLabel = period === "annual" ? "Annual" : "Monthly";

    const invoiceLink = await bot.api.createInvoiceLink(
      `SolSwap ${tierInfo.label}`,
      `${tierInfo.description} (${periodLabel})`,
      payload,
      "",     // provider_token: empty = Telegram Stars
      "XTR",  // currency: Telegram Stars
      [{ label: `${tierInfo.label} (${periodLabel})`, amount }],
    );

    res.json({ invoiceLink });
  } catch (err) {
    console.error("POST /subscribe/invoice error:", err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});
