/** Well-known Solana token mint addresses */
export const TOKENS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
};

/** Reverse lookup: mint address → ticker symbol */
export const MINT_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOKENS).map(([symbol, mint]) => [mint, symbol])
);

/** Token decimals for formatting */
export const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  BONK: 5,
  WIF: 6,
  JUP: 6,
};

/** Default slippage in basis points */
export const DEFAULT_SLIPPAGE_BPS = 50;

/** SOL decimals (lamports) */
export const LAMPORTS_PER_SOL = 1_000_000_000;
