import { Bot } from "grammy";
import { config } from "../config";
import { loggerMiddleware } from "./middleware/logger";
import { rateLimitMiddleware } from "./middleware/rateLimit";

/** Creates and configures the Grammy bot instance */
export function createBot(): Bot {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  // Global middleware — order matters
  bot.use(loggerMiddleware);
  bot.use(rateLimitMiddleware);

  // Register command handlers
  bot.command("start", (ctx) =>
    ctx.reply(
      "Welcome to SolSwap Bot!\n\n" +
        "Swap any Solana token directly from Telegram — non-custodial, powered by Jupiter.\n\n" +
        "Connect your Phantom wallet to get started:\n" +
        "/connect <YOUR_WALLET_ADDRESS>\n\n" +
        "Type /help for all commands."
    )
  );

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
