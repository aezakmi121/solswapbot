import { CommandContext, Context } from "grammy";
import { findUserByTelegramId, findUserByReferralCode, createUser } from "../../db/queries/users";
import { sanitizeInput } from "../../utils/validation";
import { config } from "../../config";

/**
 * /start [ref_CODE] — Onboard user and launch the Mini App.
 *
 * DESIGN: This is the ONLY user-facing command.
 * It creates the user record, handles referrals, and shows the Mini App button.
 */
export async function startCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();
  const telegramUsername = ctx.from.username ?? undefined;

  // Check if user already exists
  const existingUser = await findUserByTelegramId(telegramId);
  if (existingUser) {
    await ctx.reply(
      `👋 Welcome back to *SolSwap*!\n\n` +
      `Tap below to open the trading app:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            {
              text: "🚀 Open SolSwap",
              web_app: { url: config.MINIAPP_URL ?? "https://solswap.vercel.app" }
            }
          ]]
        }
      }
    );
    return;
  }

  // Parse referral code from /start ref_<CODE>
  const payload = sanitizeInput(ctx.match?.toString() ?? "");
  let referredById: string | undefined;

  if (payload.startsWith("ref_")) {
    const referralCode = payload.slice(4);
    if (referralCode.length > 0) {
      const referrer = await findUserByReferralCode(referralCode);
      if (referrer && referrer.telegramId !== telegramId) {
        referredById = referrer.id;
      }
    }
  }

  // Create new user
  const user = await createUser({
    telegramId,
    telegramUsername,
    referredById,
  });

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
          {
            text: "🚀 Open SolSwap",
            web_app: { url: config.MINIAPP_URL ?? "https://solswap.vercel.app" }
          }
        ]]
      }
    }
  );
}
