import { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";
import { getQuote, QuoteResponse } from "../../jupiter/quote";
import { buildSwapTransaction } from "../../jupiter/swap";
import { buildPhantomDeeplink } from "../../solana/phantom";
import { pollTransactionInBackground } from "../../solana/transaction";
import { estimateFeeUsd } from "../../jupiter/price";
import { sanitizeInput, isValidSwapAmount } from "../../utils/validation";
import { TOKENS, TOKEN_DECIMALS } from "../../utils/constants";
import { formatTokenAmount, formatUsd } from "../../utils/formatting";
import { toSmallestUnit } from "../../utils/formatting";

/** In-memory store for pending quotes (telegramId → quote data). Expires after 60s. */
const pendingQuotes = new Map<
  string,
  {
    quote: QuoteResponse;
    inputSymbol: string;
    outputSymbol: string;
    estimatedFeeUsd: number | null;
    expiresAt: number;
  }
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

  // Check for existing pending swap to prevent duplicates
  const existingPending = await prisma.swap.findFirst({
    where: { userId: user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (existingPending) {
    const ageMs = Date.now() - existingPending.createdAt.getTime();
    if (ageMs < 120_000) {
      await ctx.reply(
        "You already have a pending swap. Complete it first or wait for it to expire.\n\n" +
          "If you already signed, send: `/status <TX_SIGNATURE>`",
        { parse_mode: "Markdown" }
      );
      return;
    }
    // Expire old stale pending swaps
    await prisma.swap.update({
      where: { id: existingPending.id },
      data: { status: "FAILED" },
    });
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

  // Estimate fee USD now (at quote time) for accurate tracking
  const estimatedFeeUsd = await estimateFeeUsd({ outputMint, feeAmount });

  // Store quote for confirmation callback
  pendingQuotes.set(telegramId, {
    quote,
    inputSymbol,
    outputSymbol,
    estimatedFeeUsd,
    expiresAt: Date.now() + 60_000,
  });

  // Clean up expired quotes
  for (const [key, val] of pendingQuotes) {
    if (val.expiresAt < Date.now()) pendingQuotes.delete(key);
  }

  const feeUsdStr = estimatedFeeUsd !== null ? ` (~${formatUsd(estimatedFeeUsd)})` : "";

  const keyboard = new InlineKeyboard()
    .text("Confirm Swap", "swap_confirm")
    .text("Cancel", "swap_cancel");

  await ctx.reply(
    `*Swap Quote*\n\n` +
      `Sell: ${amount} ${inputSymbol}\n` +
      `Receive: ~${outFormatted} ${outputSymbol}\n` +
      `Fee: ${feeFormatted} ${outputSymbol}${feeUsdStr} (0.5%)\n` +
      `Price impact: ${priceImpactStr}\n` +
      `Slippage tolerance: 0.5%\n\n` +
      `_Quote valid for 60 seconds_`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

/**
 * Callback handler for swap confirmation button.
 * Builds the transaction, generates Phantom deeplink, and auto-starts tx polling.
 */
export async function handleSwapConfirm(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.callbackQuery) return;
  const telegramId = ctx.from.id.toString();

  await ctx.answerCallbackQuery();

  const pending = pendingQuotes.get(telegramId);
  if (!pending || pending.expiresAt < Date.now()) {
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
  try {
    const swapResult = await buildSwapTransaction({
      quoteResponse: pending.quote,
      userPublicKey: user.walletAddress,
    });
    swapTransaction = swapResult.swapTransaction;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Jupiter swap build error:", message);
    pendingQuotes.delete(telegramId);
    await ctx.reply("Failed to build swap transaction. Please try again.");
    return;
  }

  // Record swap in DB as PENDING with estimated fee
  const swap = await prisma.swap.create({
    data: {
      userId: user.id,
      inputMint: pending.quote.inputMint,
      outputMint: pending.quote.outputMint,
      inputAmount: BigInt(pending.quote.inAmount),
      outputAmount: BigInt(pending.quote.outAmount),
      feeAmountUsd: pending.estimatedFeeUsd,
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
      `Tap the button below to open Phantom and sign.\n` +
      `I'll automatically check for confirmation.\n\n` +
      `_Or send_ \`/status <TX_SIGNATURE>\` _after signing for faster tracking._`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );

  pendingQuotes.delete(telegramId);

  // Auto-poll: wait 15s for user to sign, then start checking on-chain
  // This covers users who forget to send /status
  const swapId = swap.id;
  setTimeout(() => {
    autoDetectTransaction(swapId, user.walletAddress!, ctx);
  }, 15_000);
}

/**
 * Auto-detect if a PENDING swap got submitted by checking recent transactions
 * for the user's wallet. If found, start polling for confirmation.
 */
async function autoDetectTransaction(
  swapId: string,
  walletAddress: string,
  ctx: Context,
): Promise<void> {
  try {
    // Re-check swap status — might already be tracked via /status
    const swap = await prisma.swap.findUnique({ where: { id: swapId } });
    if (!swap || swap.status !== "PENDING") return;

    // Import connection here to avoid circular deps at module load
    const { connection } = await import("../../solana/connection");
    const { PublicKey } = await import("@solana/web3.js");

    const pubkey = new PublicKey(walletAddress);
    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 3 });

    if (signatures.length === 0) return;

    // Check the most recent signature (likely the swap we just built)
    const recentSig = signatures[0];
    const sigTime = recentSig.blockTime;
    const now = Math.floor(Date.now() / 1000);

    // Only consider signatures from the last 2 minutes
    if (sigTime && now - sigTime > 120) return;

    console.log(`Auto-detected tx ${recentSig.signature} for swap ${swapId}`);

    pollTransactionInBackground(swapId, recentSig.signature, async (result) => {
      try {
        if (result === "CONFIRMED") {
          await ctx.reply(
            `Transaction confirmed! Your swap completed successfully.\n\nTx: \`${recentSig.signature}\``,
            { parse_mode: "Markdown" }
          );
        } else {
          await ctx.reply(
            `Transaction failed or expired.\n\nTx: \`${recentSig.signature}\``,
            { parse_mode: "Markdown" }
          );
        }
      } catch (err) {
        console.error("Failed to send auto-detect notification:", err);
      }
    });
  } catch (err) {
    console.error(`Auto-detect failed for swap ${swapId}:`, err);
  }
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

/**
 * /status <TX_SIGNATURE> — Submit a transaction signature to track confirmation.
 * Starts background polling and records fee USD when confirmed.
 */
export async function statusCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!ctx.from) return;
  const telegramId = ctx.from.id.toString();

  const txSignature = sanitizeInput(ctx.match?.toString() ?? "");

  if (!txSignature || txSignature.length < 64 || !/^[A-Za-z0-9]+$/.test(txSignature)) {
    await ctx.reply(
      "Usage: `/status <TX_SIGNATURE>`\n\nPaste the transaction signature from Phantom after signing.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Find the most recent PENDING or SUBMITTED swap for this user
  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.reply("You haven't started yet. Use /start first.");
    return;
  }

  const pendingSwap = await prisma.swap.findFirst({
    where: { userId: user.id, status: { in: ["PENDING", "SUBMITTED"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!pendingSwap) {
    await ctx.reply("No pending swap found. Run /swap to start a new trade.");
    return;
  }

  // If already being tracked with this signature, don't double-poll
  if (pendingSwap.txSignature === txSignature) {
    await ctx.reply("Already tracking this transaction. I'll notify you when it confirms.");
    return;
  }

  await ctx.reply("Tracking transaction... I'll notify you when it confirms.");

  pollTransactionInBackground(pendingSwap.id, txSignature, async (result) => {
    try {
      if (result === "CONFIRMED") {
        const feeStr = pendingSwap.feeAmountUsd !== null
          ? `\nFee earned: ${formatUsd(pendingSwap.feeAmountUsd)}`
          : "";
        await ctx.reply(
          `Transaction confirmed! Your swap completed successfully.${feeStr}\n\nTx: \`${txSignature}\``,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(
          `Transaction failed or expired.\n\nTx: \`${txSignature}\``,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err) {
      console.error("Failed to send status notification:", err);
    }
  });
}
