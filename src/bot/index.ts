import { Bot } from "grammy";
import { config } from "../config";
import { loggerMiddleware } from "./middleware/logger";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { startCommand } from "./commands/start";
import { connectCommand } from "./commands/connect";
import { walletCommand } from "./commands/wallet";
import { priceCommand } from "./commands/price";
import { referralCommand } from "./commands/referral";
import { historyCommand } from "./commands/history";
import { swapCommand, handleSwapConfirm, handleSwapCancel, statusCommand } from "./commands/swap";

/** Creates and configures the Grammy bot instance */
export function createBot(): Bot {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  // Global middleware — order matters
  bot.use(loggerMiddleware);
  bot.use(rateLimitMiddleware);

  // Register command handlers
  bot.command("start", startCommand);
  bot.command("connect", connectCommand);
  bot.command("wallet", walletCommand);
  bot.command("price", priceCommand);
  bot.command("referral", referralCommand);
  bot.command("history", historyCommand);
  bot.command("swap", swapCommand);
  bot.command("status", statusCommand);

  // Inline keyboard callback handlers for swap confirmation
  bot.callbackQuery("swap_confirm", handleSwapConfirm);
  bot.callbackQuery("swap_cancel", handleSwapCancel);

  bot.command("help", (ctx) =>
    ctx.reply(
      `📖 *SolSwap Bot Commands*\n\n` +
      `🚀 *Getting Started*\n` +
      `/start — Create your account\n` +
      `/connect \`<ADDRESS>\` — Link your Phantom wallet\n` +
      `/wallet — View wallet & SOL balance\n\n` +
      `💱 *Trading*\n` +
      `/swap \`<AMOUNT> <FROM> <TO>\` — Swap tokens\n` +
      `   _Example: /swap 1 SOL USDC_\n` +
      `/price \`<TOKEN>\` — Check token price\n` +
      `/status \`<TX>\` — Track your transaction\n` +
      `/history — Last 10 swaps\n\n` +
      `🤝 *Referrals*\n` +
      `/referral — Your link & earnings\n\n` +
      `💡 *Supported tokens:* SOL, USDC, USDT, BONK, WIF, JUP`,
      { parse_mode: "Markdown" }
    )
  );

  // Catch-all for unrecognized messages
  bot.on("message:text", (ctx) =>
    ctx.reply("Unknown command. Type /help to see available commands.")
  );

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err.message);
  });

  return bot;
}
