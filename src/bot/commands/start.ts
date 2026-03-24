import { CommandContext, Context, Bot } from "grammy";
import { findUserByReferralCode, upsertUser } from "../../db/queries/users";
import { sanitizeInput } from "../../utils/validation";
import { config } from "../../config";

/** Bot instance reference — set by createBot() so we can send referral notifications */
let botInstance: Bot | null = null;
export function setBotInstance(bot: Bot) { botInstance = bot; }
export function getBotInstance(): Bot | null { return botInstance; }

const miniAppUrl = () => config.MINIAPP_URL ?? "https://solswap.vercel.app";

/**
 * /start [ref_CODE] — Onboard user and launch the Mini App.
 *
 * DESIGN: This is the ONLY user-facing command.
 * It creates the user record, handles referrals, and shows the Mini App button.
 *
 * Uses upsert to prevent race conditions when /start is sent twice (H6).
 * Wrapped in try/catch to prevent silent failures (H7).
 */
export async function startCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;

  try {
    const telegramId = ctx.from.id.toString();
    const telegramUsername = ctx.from.username ?? undefined;

    // Parse referral code from /start ref_<CODE>
    const payload = sanitizeInput(ctx.match?.toString() ?? "");
    let referredById: string | undefined;
    let referrerTelegramId: string | undefined;

    if (payload.startsWith("ref_")) {
      const referralCode = payload.slice(4);
      if (referralCode.length > 0) {
        const referrer = await findUserByReferralCode(referralCode);
        if (referrer && referrer.telegramId !== telegramId) {
          referredById = referrer.id;
          referrerTelegramId = referrer.telegramId;
        }
      }
    }

    // Upsert: create if new, update username if existing (H6 — no TOCTOU race)
    const { isNew } = await upsertUser({
      telegramId,
      telegramUsername,
      referredById,
    });

    // Notify referrer when a new user joins via their link
    if (isNew && referrerTelegramId && botInstance) {
      const newUsername = telegramUsername ? `@${telegramUsername}` : "Someone";
      botInstance.api.sendMessage(
        referrerTelegramId,
        `🎉 *${newUsername}* just joined SolSwap using your referral link\\!\n\nYou now earn 25% of their swap fees\\.`,
        { parse_mode: "MarkdownV2" }
      ).catch(() => {}); // Non-blocking — don't fail /start if notification fails
    }

    if (!isNew) {
      await ctx.reply(
        `👋 Welcome back to *SolSwap*!\n\n` +
        `Tap below to open the trading app:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🚀 Open SolSwap", web_app: { url: miniAppUrl() } }
            ]]
          }
        }
      );
      return;
    }

    const referralNote = referredById
      ? "\n🤝 You were referred by a friend — welcome aboard!"
      : "";

    await ctx.reply(
      `⚡ *Welcome to SolSwap!*\n\n` +
      `Swap tokens across Solana, Ethereum, and more — right here in Telegram.\n\n` +
      `✅ No external wallets needed\n` +
      `✅ Your keys stay safe (MPC encryption)\n` +
      `✅ Cross-chain swaps in seconds\n` +
      `✅ Token safety scanner built-in${referralNote}\n\n` +
      `Tap below to get started:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "🚀 Open SolSwap", web_app: { url: miniAppUrl() } }
          ]]
        }
      }
    );
  } catch (err) {
    console.error("startCommand error:", err);
    await ctx.reply("Something went wrong. Please try /start again.").catch(() => {});
  }
}
