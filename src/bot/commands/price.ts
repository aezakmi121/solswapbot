import { CommandContext, Context } from "grammy";
import { TOKENS } from "../../utils/constants";
import { sanitizeInput } from "../../utils/validation";

const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";

interface JupiterPriceV3Entry {
  usdPrice: number;
  decimals: number;
}

type JupiterPriceResponse = Record<string, JupiterPriceV3Entry>;

/**
 * /price <TOKEN> — Get token price in USD via Jupiter price API.
 */
export async function priceCommand(ctx: CommandContext<Context>): Promise<void> {
  const input = sanitizeInput(ctx.match?.toString() ?? "").toUpperCase();

  if (!input) {
    await ctx.reply(
      "Usage: `/price <TOKEN>`\n\nExample: `/price SOL`\n\n" +
      `Supported: ${Object.keys(TOKENS).join(", ")}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const mintAddress = TOKENS[input];
  if (!mintAddress) {
    await ctx.reply(
      `Unknown token: "${input}"\n\n` +
      `Supported tokens: ${Object.keys(TOKENS).join(", ")}`,
    );
    return;
  }

  try {
    const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mintAddress}`);

    if (!response.ok) {
      await ctx.reply("Failed to fetch price. Please try again later.");
      return;
    }

    const data = (await response.json()) as JupiterPriceResponse;
    const priceInfo = data[mintAddress];

    if (!priceInfo) {
      await ctx.reply(`No price data available for ${input}.`);
      return;
    }

    const price = priceInfo.usdPrice;
    const formatted = price < 0.01
      ? `$${price.toPrecision(4)}`
      : `$${price.toFixed(2)}`;

    await ctx.reply(`*${input}* price: ${formatted}`, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Price fetch error:", err);
    await ctx.reply("Failed to fetch price. Please try again later.");
  }
}
