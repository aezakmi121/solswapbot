import { CommandContext, Context } from "grammy";
import { getUserWithReferralCount } from "../../db/queries/users";
import { getReferralEarnings } from "../../db/queries/referrals";
import { config } from "../../config";
import { formatUsd } from "../../utils/formatting";

/**
 * /referral — Show referral link, count, and lifetime earnings.
 */
export async function referralCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();
  const user = await getUserWithReferralCount(telegramId);

  if (!user) {
    await ctx.reply("You haven't started yet. Use /start first.");
    return;
  }

  const referralCount = user._count.referrals;
  const earnings = await getReferralEarnings(user.id, config.REFERRAL_FEE_SHARE_PERCENT);
  const botInfo = await ctx.api.getMe();
  const referralLink = `https://t.me/${botInfo.username}?start=ref_${user.referralCode}`;

  await ctx.reply(
    `*Your Referral Dashboard*\n\n` +
      `Referral link:\n\`${referralLink}\`\n\n` +
      `Referrals: ${referralCount} user${referralCount !== 1 ? "s" : ""}\n` +
      `Lifetime earnings: ${formatUsd(earnings)}\n` +
      `Fee share: ${config.REFERRAL_FEE_SHARE_PERCENT}% of every swap by your referrals\n\n` +
      `Share your link to start earning!`,
    { parse_mode: "Markdown" }
  );
}
