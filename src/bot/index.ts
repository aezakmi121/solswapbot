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
import { swapCommand, handleSwapConfirm, handleSwapCancel } from "./commands/swap";

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

  // Inline keyboard callback handlers for swap confirmation
  bot.callbackQuery("swap_confirm", handleSwapConfirm);
  bot.callbackQuery("swap_cancel", handleSwapCancel);

  bot.command("help", (ctx) =>
    ctx.reply(
      "Available commands:\n\n" +
        "/start — Get started\n" +
        "/connect <ADDRESS> — Connect your Phantom wallet\n" +
        "/wallet — View connected wallet & balance\n" +
        "/swap <AMOUNT> <FROM> <TO> — Swap tokens\n" +
        "/price <TOKEN> — Get token price\n" +
        "/referral — Your referral link & earnings\n" +
        "/history — Last 10 swaps\n" +
        "/help — Show this message"
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
