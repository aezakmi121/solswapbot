import { CommandContext, Context } from "grammy";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";
import { MINT_TO_SYMBOL } from "../../utils/constants";
import { shortenAddress } from "../../utils/formatting";

/**
 * /history — Show last 10 swaps for the user.
 */
export async function historyCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();
  const user = await findUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply("You haven't started yet. Use /start first.");
    return;
  }

  const swaps = await prisma.swap.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (swaps.length === 0) {
    await ctx.reply("No swaps yet. Try /swap to make your first trade!");
    return;
  }

  const lines = swaps.map((swap, i) => {
    const from = MINT_TO_SYMBOL[swap.inputMint] ?? shortenAddress(swap.inputMint);
    const to = MINT_TO_SYMBOL[swap.outputMint] ?? shortenAddress(swap.outputMint);
    const status = swap.status === "CONFIRMED" ? "✅" : swap.status === "FAILED" ? "❌" : "⏳";
    const date = swap.createdAt.toISOString().slice(0, 10);
    return `${i + 1}. ${status} ${from} → ${to} (${date})`;
  });

  await ctx.reply(
    `*Last ${swaps.length} Swaps*\n\n${lines.join("\n")}`,
    { parse_mode: "Markdown" }
  );
}
