import { CommandContext, Context } from "grammy";
import { findUserByTelegramId, updateUserWallet } from "../../db/queries/users";
import { isValidPublicKey } from "../../utils/validation";
import { sanitizeInput } from "../../utils/validation";

/**
 * /connect <ADDRESS> — Connect a Phantom wallet address.
 */
export async function connectCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();
  const user = await findUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply("You haven't started yet. Use /start first.");
    return;
  }

  const rawAddress = sanitizeInput(ctx.match?.toString() ?? "");

  if (!rawAddress) {
    await ctx.reply(
      "Please provide your Phantom wallet address:\n\n" +
        "`/connect <YOUR_WALLET_ADDRESS>`\n\n" +
        "You can find it in the Phantom app by tapping your address at the top.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (!isValidPublicKey(rawAddress)) {
    await ctx.reply(
      "Invalid wallet address. Please provide a valid Solana wallet address.\n\n" +
        "It should look like: `7xKX...3pNm` (32-44 characters, base58)",
      { parse_mode: "Markdown" }
    );
    return;
  }

  await updateUserWallet(telegramId, rawAddress);

  await ctx.reply(
    `Wallet connected!\n\n` +
      `Address: \`${rawAddress}\`\n\n` +
      `You're ready to swap. Try:\n` +
      `/swap 0.1 SOL USDC\n` +
      `/price SOL`,
    { parse_mode: "Markdown" }
  );
}
