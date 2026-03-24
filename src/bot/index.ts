import { Bot } from "grammy";
import { config } from "../config";
import { loggerMiddleware } from "./middleware/logger";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { startCommand, setBotInstance } from "./commands/start";
import { registerPaymentHandlers, TIER_PRICES } from "./handlers/payment";
import { findUserByTelegramId } from "../db/queries/users";

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

  // Payment handlers — must be registered before commands (Grammy processes in order)
  registerPaymentHandlers(bot);

  // The ONLY user-facing commands
  bot.command("start", startCommand);

  // /subscribe — show tier options with inline keyboard
  bot.command("subscribe", async (ctx) => {
    const tiers = Object.entries(TIER_PRICES);
    const buttons = tiers.map(([key, info]) => [{
      text: `${info.label} — ${info.monthly}⭐/mo`,
      callback_data: `sub_${key}_monthly`,
    }]);
    buttons.push([{ text: "📅 View Annual Plans (save 20%)", callback_data: "sub_annual_menu" }]);

    await ctx.reply(
      `⭐ *SolSwap Pro Subscriptions*\n\n` +
      `Unlock premium features:\n\n` +
      `🔍 *Scanner Pro* — Unlimited token scans\n` +
      `👁 *Whale Tracker* — Track up to 20 wallets\n` +
      `🚀 *All Access* — Everything included\n\n` +
      `Choose a plan:`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons },
      }
    );
  });

  // Callback query handler for subscription buttons
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("sub_")) return;

    // Annual menu
    if (data === "sub_annual_menu") {
      const tiers = Object.entries(TIER_PRICES);
      const buttons = tiers.map(([key, info]) => [{
        text: `${info.label} — ${info.annual}⭐/yr (save 20%)`,
        callback_data: `sub_${key}_annual`,
      }]);
      buttons.push([{ text: "◀ Back to Monthly", callback_data: "sub_monthly_menu" }]);
      await ctx.editMessageText(
        `📅 *Annual Plans* \\(save 20%\\)\n\nChoose a plan:`,
        { parse_mode: "MarkdownV2", reply_markup: { inline_keyboard: buttons } }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // Monthly menu (back button)
    if (data === "sub_monthly_menu") {
      const tiers = Object.entries(TIER_PRICES);
      const buttons = tiers.map(([key, info]) => [{
        text: `${info.label} — ${info.monthly}⭐/mo`,
        callback_data: `sub_${key}_monthly`,
      }]);
      buttons.push([{ text: "📅 View Annual Plans (save 20%)", callback_data: "sub_annual_menu" }]);
      await ctx.editMessageText(
        `⭐ *SolSwap Pro Subscriptions*\n\nChoose a plan:`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // Parse: sub_TIER_PERIOD
    const parts = data.split("_");
    if (parts.length !== 3) return;
    const tier = parts[1];
    const period = parts[2] as "monthly" | "annual";
    const tierInfo = TIER_PRICES[tier];
    if (!tierInfo) return;

    try {
      const telegramId = ctx.from.id.toString();
      const user = await findUserByTelegramId(telegramId);
      if (!user) {
        await ctx.answerCallbackQuery({ text: "Send /start first to create your account" });
        return;
      }

      const amount = period === "annual" ? tierInfo.annual : tierInfo.monthly;
      const duration = period === "annual" ? "365d" : "30d";
      const payload = `${tier}|${user.id}|${duration}`;

      const link = await ctx.api.createInvoiceLink(
        `SolSwap ${tierInfo.label}`,
        tierInfo.description,
        payload,
        "",  // provider_token: empty = Telegram Stars
        "XTR",
        [{ label: `${tierInfo.label} (${period})`, amount }],
      );

      await ctx.answerCallbackQuery();
      await ctx.reply(`💳 Tap below to pay with Telegram Stars:`, {
        reply_markup: {
          inline_keyboard: [[{ text: `Pay ${amount}⭐ for ${tierInfo.label}`, url: link }]],
        },
      });
    } catch (err) {
      console.error("Subscribe callback error:", err);
      await ctx.answerCallbackQuery({ text: "Something went wrong. Try again." });
    }
  });

  // Help just points to the Mini App
  bot.command("help", (ctx) =>
    ctx.reply(
      `⚡ *SolSwap*\n\n` +
      `Everything you need is in the Mini App!\n\n` +
      `Use /subscribe to upgrade your plan (Scanner Pro, Whale Tracker, or All Access).\n\n` +
      `Tap the button below to open the app:`,
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
