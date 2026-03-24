import { prisma } from "../db/client";
import { getBotInstance } from "../bot/commands/start";
import { TIER_PRICES } from "../bot/handlers/payment";
import { config } from "../config";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const EXPIRY_WARNING_HOURS = 24;

/**
 * Background poller that sends expiry notifications:
 * 1. "Expiring soon" — subscription expires within 23-25 hours (caught once per 1h poll)
 * 2. "Expired" — subscription expired in the last hour
 *
 * No extra DB columns needed — uses time-window approach for dedup.
 */
export function startExpiryPoller(): void {
  console.log("Subscription expiry poller started (interval: 1h)");

  // Run first check after 5 minutes (let the bot fully start)
  setTimeout(checkExpiries, 5 * 60 * 1000);

  // Then every hour
  setInterval(checkExpiries, POLL_INTERVAL_MS);
}

async function checkExpiries(): Promise<void> {
  try {
    const bot = getBotInstance();
    if (!bot) return;

    const now = new Date();

    // 1. Expiring soon: expiresAt is between 23h and 25h from now
    //    This 2-hour window ensures the 1-hour poll catches each sub exactly once
    const warningStart = new Date(now.getTime() + (EXPIRY_WARNING_HOURS - 1) * 60 * 60 * 1000);
    const warningEnd = new Date(now.getTime() + (EXPIRY_WARNING_HOURS + 1) * 60 * 60 * 1000);

    const expiringSoon = await prisma.subscription.findMany({
      where: {
        tier: { not: "FREE" },
        expiresAt: { gte: warningStart, lte: warningEnd },
      },
      include: { user: true },
    });

    for (const sub of expiringSoon) {
      const tierInfo = TIER_PRICES[sub.tier];
      const tierLabel = tierInfo?.label ?? sub.tier;

      try {
        await bot.api.sendMessage(
          sub.user.telegramId,
          `⏰ Your *${tierLabel}* subscription expires tomorrow\\!\n\n` +
          `Renew now to keep your premium features\\. Use /subscribe to renew\\.`,
          { parse_mode: "MarkdownV2" }
        );
        console.log(`[expiry] Sent warning to ${sub.user.telegramId} (${sub.tier} expires ${sub.expiresAt?.toISOString()})`);
      } catch (err) {
        // User may have blocked the bot — non-fatal
        console.warn(`[expiry] Failed to notify ${sub.user.telegramId}:`, err instanceof Error ? err.message : err);
      }
    }

    // 2. Just expired: expiresAt is between now-1h and now
    const expiredStart = new Date(now.getTime() - POLL_INTERVAL_MS);

    const justExpired = await prisma.subscription.findMany({
      where: {
        tier: { not: "FREE" },
        expiresAt: { gte: expiredStart, lt: now },
      },
      include: { user: true },
    });

    for (const sub of justExpired) {
      const tierInfo = TIER_PRICES[sub.tier];
      const tierLabel = tierInfo?.label ?? sub.tier;

      try {
        await bot.api.sendMessage(
          sub.user.telegramId,
          `📋 Your *${tierLabel}* subscription has expired\\.\n\n` +
          `You're back on the Free plan\\. Upgrade anytime with /subscribe\\!`,
          { parse_mode: "MarkdownV2" }
        );
        console.log(`[expiry] Sent expired notice to ${sub.user.telegramId} (${sub.tier})`);
      } catch (err) {
        console.warn(`[expiry] Failed to notify ${sub.user.telegramId}:`, err instanceof Error ? err.message : err);
      }
    }

    if (expiringSoon.length > 0 || justExpired.length > 0) {
      console.log(`[expiry] Processed: ${expiringSoon.length} warning(s), ${justExpired.length} expired notice(s)`);
    }
  } catch (err) {
    console.error("[expiry] Poller error:", err);
  }
}
