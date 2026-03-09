import { Bot } from "grammy";
import { config } from "../config";
import { loggerMiddleware } from "./middleware/logger";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { startCommand, setBotInstance } from "./commands/start";

/**
 * Creates and configures the Grammy bot instance.
 *
 * DESIGN: The bot is a LAUNCHER only. All features live in the Mini App.
 * The bot's only jobs are:
 *   1. /start → show welcome + "Open SolSwap" button
 *   2. Push notifications (whale alerts, swap confirmations, signals)
 */
export function createBot(): Bot {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  // Store bot instance so startCommand can send referral notifications
  setBotInstance(bot);

  // Global middleware — order matters
  bot.use(loggerMiddleware);
  bot.use(rateLimitMiddleware);

  // The ONLY user-facing command
  bot.command("start", startCommand);

  // Help just points to the Mini App
  bot.command("help", (ctx) =>
    ctx.reply(
      `⚡ *SolSwap*\n\n` +
      `Everything you need is in the Mini App!\n\n` +
      `Tap the button below to open it:`,
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
    )
  );

  // Catch-all for messages — direct to Mini App
  bot.on("message:text", (ctx) =>
    ctx.reply(
      "👋 Open the Mini App to swap, scan, and track tokens!",
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: "🚀 Open SolSwap",
              web_app: { url: config.MINIAPP_URL ?? "https://solswap.vercel.app" }
            }
          ]]
        }
      }
    )
  );

  // Error handler — log full context so errors are never silently swallowed (M12)
  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    const updateType = ctx?.msg ? "message" : ctx?.callbackQuery ? "callback_query" : "unknown";
    console.error(
      "Bot error:",
      ctx ? `from=${ctx.from?.id} chat=${ctx.chat?.id} update_type=${updateType}` : "(no ctx)",
      e instanceof Error ? e.stack ?? e.message : e
    );
  });

  return bot;
}
