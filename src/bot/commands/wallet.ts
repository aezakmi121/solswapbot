import { CommandContext, Context } from "grammy";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { findUserByTelegramId } from "../../db/queries/users";
import { connection } from "../../solana/connection";
import { shortenAddress } from "../../utils/formatting";

/**
 * /wallet — Show connected wallet address and SOL balance.
 */
export async function walletCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();
  const user = await findUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply("You haven't started yet. Use /start first.");
    return;
  }

  if (!user.walletAddress) {
    await ctx.reply(
      "No wallet connected.\n\nUse /connect <ADDRESS> to link your Phantom wallet."
    );
    return;
  }

  let balanceText: string;
  try {
    const pubkey = new PublicKey(user.walletAddress);
    const lamports = await connection.getBalance(pubkey);
    const sol = lamports / LAMPORTS_PER_SOL;
    balanceText = `${sol.toFixed(4)} SOL`;
  } catch {
    balanceText = "Unable to fetch balance";
  }

  await ctx.reply(
    `*Your Wallet*\n\n` +
      `Address: \`${user.walletAddress}\`\n` +
      `Short: ${shortenAddress(user.walletAddress)}\n` +
      `Balance: ${balanceText}`,
    { parse_mode: "Markdown" }
  );
}
