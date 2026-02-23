import { CommandContext, Context } from "grammy";
import { findUserByTelegramId, findUserByReferralCode, createUser } from "../../db/queries/users";
import { sanitizeInput } from "../../utils/validation";

/**
 * /start [ref_CODE] — Onboard user, create DB record, handle referral linking.
 */
export async function startCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();
  const telegramUsername = ctx.from.username ?? undefined;

  // Check if user already exists
  const existingUser = await findUserByTelegramId(telegramId);
  if (existingUser) {
    const walletStatus = existingUser.walletAddress
      ? `✅ Wallet connected: \`${existingUser.walletAddress}\``
      : "⚠️ No wallet connected yet.\n\nTo start trading, link your Phantom wallet:\n`/connect <YOUR_WALLET_ADDRESS>`";

    await ctx.reply(
      `👋 Welcome back!\n\n${walletStatus}\n\nType /help to see what I can do.`,
      { parse_mode: "Markdown" }
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
    `🔄 *Welcome to SolSwap Bot!*\n\n` +
    `Swap any Solana token instantly — right here in Telegram.\n` +
    `Your funds stay in YOUR wallet. We never hold your keys.${referralNote}\n\n` +
    `*Get started in 2 steps:*\n\n` +
    `1️⃣ Connect your Phantom wallet:\n` +
    `/connect <YOUR_WALLET_ADDRESS>\n\n` +
    `2️⃣ Start trading:\n` +
    `/swap 1 SOL USDC\n\n` +
    `💎 Your referral code: \`${user.referralCode}\`\n` +
    `Share it to earn 25% of fees from anyone you refer!\n\n` +
    `Type /help for all commands.`,
    { parse_mode: "Markdown" }
  );
}
