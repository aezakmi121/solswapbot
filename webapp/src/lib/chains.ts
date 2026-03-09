// ─── Cross-chain registry (mirrors backend src/aggregator/chains.ts) ──────────
// Hardcoded curated list — covers ~99% of bridge use cases.
// Phase 3: can optionally fetch from /api/cross-chain/tokens (LI.FI-backed).

export const CC_CHAINS = [
    { id: "solana",   name: "Solana",    emoji: "🟣" },
    { id: "ethereum", name: "Ethereum",  emoji: "🔷" },
    { id: "bsc",      name: "BNB Chain", emoji: "🟡" },
    { id: "polygon",  name: "Polygon",   emoji: "🟪" },
    { id: "arbitrum", name: "Arbitrum",  emoji: "🔵" },
    { id: "base",     name: "Base",      emoji: "🔵" },
] as const;

export type ChainId = typeof CC_CHAINS[number]["id"];

export const CC_TOKENS: Record<ChainId, Array<{ symbol: string; address: string; decimals: number }>> = {
    solana: [
        { symbol: "SOL",  address: "So11111111111111111111111111111111111111112", decimals: 9 },
        { symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
        { symbol: "USDT", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
        { symbol: "BONK", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
        { symbol: "JUP",  address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  decimals: 6 },
    ],
    ethereum: [
        { symbol: "ETH",  address: "0x0000000000000000000000000000000000000000", decimals: 18 },
        { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
        { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
        { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
        { symbol: "DAI",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    ],
    bsc: [
        { symbol: "BNB",  address: "0x0000000000000000000000000000000000000000", decimals: 18 },
        { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
        { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
        { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
    ],
    polygon: [
        { symbol: "MATIC", address: "0x0000000000000000000000000000000000000000", decimals: 18 },
        { symbol: "USDC",  address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
        { symbol: "USDT",  address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
        { symbol: "WETH",  address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    ],
    arbitrum: [
        { symbol: "ETH",  address: "0x0000000000000000000000000000000000000000", decimals: 18 },
        { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
        { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
        { symbol: "ARB",  address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
    ],
    base: [
        { symbol: "ETH",  address: "0x0000000000000000000000000000000000000000", decimals: 18 },
        { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
        { symbol: "DAI",  address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
    ],
};

/** Map our internal chain IDs to EVM numeric chain IDs (for Privy sendTransaction) */
export const EVM_CHAIN_IDS: Partial<Record<ChainId, number>> = {
    ethereum: 1,
    bsc: 56,
    polygon: 137,
    arbitrum: 42161,
    base: 8453,
};

/** Block explorer URL for each chain's transactions */
export const EXPLORER_TX_URL: Record<ChainId, string> = {
    solana:   "https://solscan.io/tx/",
    ethereum: "https://etherscan.io/tx/",
    bsc:      "https://bscscan.com/tx/",
    polygon:  "https://polygonscan.com/tx/",
    arbitrum: "https://arbiscan.io/tx/",
    base:     "https://basescan.org/tx/",
};

/** Display metadata for tokens shown in the modal */
export const TOKEN_META: Record<string, { name: string; emoji: string }> = {
    SOL:   { name: "Solana",        emoji: "🟣" },
    USDC:  { name: "USD Coin",      emoji: "💵" },
    USDT:  { name: "Tether",        emoji: "💲" },
    BONK:  { name: "Bonk",          emoji: "🐕" },
    JUP:   { name: "Jupiter",       emoji: "🪐" },
    ETH:   { name: "Ether",         emoji: "💙" },
    WETH:  { name: "Wrapped ETH",   emoji: "🔵" },
    DAI:   { name: "Dai",           emoji: "🟡" },
    BNB:   { name: "BNB",           emoji: "🟡" },
    WBNB:  { name: "Wrapped BNB",   emoji: "🟡" },
    MATIC: { name: "Polygon",       emoji: "🟪" },
    ARB:   { name: "Arbitrum",      emoji: "🔵" },
};
