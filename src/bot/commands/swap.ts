import { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";
import { getQuote, QuoteResponse } from "../../jupiter/quote";
import { buildSwapTransaction } from "../../jupiter/swap";
import { buildPhantomDeeplink } from "../../solana/phantom";
import { sanitizeInput, isValidSwapAmount } from "../../utils/validation";
import { TOKENS, TOKEN_DECIMALS, MINT_TO_SYMBOL } from "../../utils/constants";
import { formatTokenAmount, formatUsd } from "../../utils/formatting";
import { toSmallestUnit } from "../../utils/formatting";

/** In-memory store for pending quotes (telegramId → quote data). Expires after 60s. */
const pendingQuotes = new Map<
  string,
  { quote: QuoteResponse; inputSymbol: string; outputSymbol: string; expiresAt: number }
>();

/**
 * /swap <AMOUNT> <FROM> <TO> — Full swap flow.
 * Step 1: Validate input, fetch Jupiter quote, show confirmation.
 */
export async function swapCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();

  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.reply("You haven't started yet. Use /start first.");
    return;
  }
  if (!user.walletAddress) {
    await ctx.reply("Connect your wallet first with /connect <ADDRESS>");
    return;
  }

  // Parse: /swap 1.5 SOL USDC
  const raw = sanitizeInput(ctx.match?.toString() ?? "");
  const parts = raw.split(/\s+/);

  if (parts.length < 3) {
    await ctx.reply(
      "Usage: `/swap <AMOUNT> <FROM> <TO>`\n\n" +
        "Example: `/swap 1 SOL USDC`\n" +
        `Supported tokens: ${Object.keys(TOKENS).join(", ")}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const amount = parseFloat(parts[0]);
  const inputSymbol = parts[1].toUpperCase();
  const outputSymbol = parts[2].toUpperCase();

  if (!isValidSwapAmount(amount)) {
    await ctx.reply("Invalid amount. Must be a positive number.");
    return;
  }

  const inputMint = TOKENS[inputSymbol];
  const outputMint = TOKENS[outputSymbol];

  if (!inputMint) {
    await ctx.reply(`Unknown token: "${inputSymbol}". Supported: ${Object.keys(TOKENS).join(", ")}`);
    return;
  }
  if (!outputMint) {
    await ctx.reply(`Unknown token: "${outputSymbol}". Supported: ${Object.keys(TOKENS).join(", ")}`);
    return;
  }
  if (inputMint === outputMint) {
    await ctx.reply("Cannot swap a token to itself.");
    return;
  }

  const inputDecimals = TOKEN_DECIMALS[inputSymbol] ?? 9;
  const amountSmallest = toSmallestUnit(amount, inputDecimals).toString();

  // Fetch quote from Jupiter
  await ctx.reply("Fetching best swap route...");

  let quote: QuoteResponse;
  try {
    quote = await getQuote({
      inputMint,
      outputMint,
      amount: amountSmallest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("No routes found") || message.includes("404")) {
      await ctx.reply("No swap route found for this pair. Try a different amount or token.");
    } else {
      console.error("Jupiter quote error:", message);
      await ctx.reply("Failed to get swap quote. Please try again later.");
    }
    return;
  }

  // Calculate display values
  const outputDecimals = TOKEN_DECIMALS[outputSymbol] ?? 9;
  const outFormatted = formatTokenAmount(quote.outAmount, outputDecimals);
  const feeAmount = quote.platformFee?.amount ?? "0";
  const feeFormatted = formatTokenAmount(feeAmount, outputDecimals);
  const priceImpact = parseFloat(quote.priceImpactPct);
  const priceImpactStr = priceImpact < 0.01 ? "<0.01%" : `${priceImpact.toFixed(2)}%`;

  // Store quote for confirmation callback
  pendingQuotes.set(telegramId, {
    quote,
    inputSymbol,
    outputSymbol,
    expiresAt: Date.now() + 60_000,
  });

  // Clean up expired quotes periodically
  for (const [key, val] of pendingQuotes) {
    if (val.expiresAt < Date.now()) pendingQuotes.delete(key);
  }

  const keyboard = new InlineKeyboard()
    .text("Confirm Swap", "swap_confirm")
    .text("Cancel", "swap_cancel");

  await ctx.reply(
    `*Swap Quote*\n\n` +
      `Sell: ${amount} ${inputSymbol}\n` +
      `Receive: ~${outFormatted} ${outputSymbol}\n` +
      `Fee: ${feeFormatted} ${outputSymbol} (0.5%)\n` +
      `Price impact: ${priceImpactStr}\n` +
      `Slippage tolerance: 0.5%\n\n` +
      `_Quote valid for 60 seconds_`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

/**
 * Callback handler for swap confirmation button.
 * Builds the transaction and generates Phantom deeplink.
 */
export async function handleSwapConfirm(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.callbackQuery) return;
  const telegramId = ctx.from.id.toString();

  await ctx.answerCallbackQuery();

  const pending = pendingQuotes.get(telegramId);
  if (!pending) {
    await ctx.reply("Quote expired. Please run /swap again.");
    return;
  }

  if (pending.expiresAt < Date.now()) {
    pendingQuotes.delete(telegramId);
    await ctx.reply("Quote expired. Please run /swap again.");
    return;
  }

  const user = await findUserByTelegramId(telegramId);
  if (!user?.walletAddress) {
    await ctx.reply("Wallet not found. Use /connect <ADDRESS> first.");
    return;
  }

  // Build swap transaction via Jupiter
  await ctx.reply("Building transaction...");

  let swapTransaction: string;
  let lastValidBlockHeight: number;
  try {
    const swapResult = await buildSwapTransaction({
      quoteResponse: pending.quote,
      userPublicKey: user.walletAddress,
    });
    swapTransaction = swapResult.swapTransaction;
    lastValidBlockHeight = swapResult.lastValidBlockHeight;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Jupiter swap build error:", message);
    pendingQuotes.delete(telegramId);
    await ctx.reply("Failed to build swap transaction. Please try again.");
    return;
  }

  // Record swap in DB as PENDING
  const swap = await prisma.swap.create({
    data: {
      userId: user.id,
      inputMint: pending.quote.inputMint,
      outputMint: pending.quote.outputMint,
      inputAmount: BigInt(pending.quote.inAmount),
      outputAmount: BigInt(pending.quote.outAmount),
      status: "PENDING",
    },
  });

  // Generate Phantom deeplink
  const botInfo = await ctx.api.getMe();
  const deeplink = buildPhantomDeeplink({
    swapTransaction,
    botUsername: botInfo.username ?? "",
  });

  const outputDecimals = TOKEN_DECIMALS[pending.outputSymbol] ?? 9;
  const outFormatted = formatTokenAmount(pending.quote.outAmount, outputDecimals);

  const keyboard = new InlineKeyboard().url("Sign in Phantom", deeplink);

  await ctx.reply(
    `*Ready to sign!*\n\n` +
      `Swapping ${pending.inputSymbol} → ~${outFormatted} ${pending.outputSymbol}\n\n` +
      `Tap the button below to open Phantom and sign the transaction.\n` +
      `The transaction will expire in ~60 seconds.`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );

  pendingQuotes.delete(telegramId);
}

/**
 * Callback handler for swap cancel button.
 */
export async function handleSwapCancel(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.callbackQuery) return;
  const telegramId = ctx.from.id.toString();

  await ctx.answerCallbackQuery();
  pendingQuotes.delete(telegramId);
  await ctx.reply("Swap cancelled.");
}
