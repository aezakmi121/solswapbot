/**
 * Cross-chain and multi-chain token/chain registry.
 *
 * Used by the aggregator router to:
 *   - Identify which chain a token belongs to
 *   - Map ticker symbols to mint/contract addresses
 *   - Provide chain metadata (name, icon, LI.FI chain ID)
 *
 * LI.FI uses NUMERIC chain IDs:
 *   Solana = 1151111081099710
 *   Ethereum = 1
 *   BSC = 56
 *   Polygon = 137
 *   Arbitrum = 42161
 *   Base = 8453
 */

export interface ChainInfo {
    id: string;           // Our internal ID: "solana", "ethereum", "bsc"
    name: string;         // e.g. "Solana", "Ethereum"
    shortName: string;    // e.g. "SOL", "ETH"
    lifiChainId: string;  // Numeric chain ID for LI.FI API
    nativeToken: string;  // Native token ticker
    icon: string;         // Emoji icon
}

export interface TokenInfo {
    symbol: string;
    name: string;
    chainId: string;
    address: string;      // Mint address (Solana) or contract address (EVM)
    decimals: number;
    icon: string;
}

// ─── Supported Chains ─────────────────────────────────────────────────
export const CHAINS: Record<string, ChainInfo> = {
    solana: {
        id: "solana",
        name: "Solana",
        shortName: "SOL",
        lifiChainId: "1151111081099710",
        nativeToken: "SOL",
        icon: "🟣",
    },
    ethereum: {
        id: "ethereum",
        name: "Ethereum",
        shortName: "ETH",
        lifiChainId: "1",
        nativeToken: "ETH",
        icon: "🔷",
    },
    bsc: {
        id: "bsc",
        name: "BNB Chain",
        shortName: "BNB",
        lifiChainId: "56",
        nativeToken: "BNB",
        icon: "🟡",
    },
    polygon: {
        id: "polygon",
        name: "Polygon",
        shortName: "MATIC",
        lifiChainId: "137",
        nativeToken: "MATIC",
        icon: "🟣",
    },
    arbitrum: {
        id: "arbitrum",
        name: "Arbitrum",
        shortName: "ARB",
        lifiChainId: "42161",
        nativeToken: "ETH",
        icon: "🔵",
    },
    base: {
        id: "base",
        name: "Base",
        shortName: "BASE",
        lifiChainId: "8453",
        nativeToken: "ETH",
        icon: "🔵",
    },
};

// ─── Token Registry ───────────────────────────────────────────────────
// Common tokens across chains. Used for ticker-to-address lookups.
// LI.FI native token address = 0x0000000000000000000000000000000000000000
// Solana native (SOL) address = 11111111111111111111111111111111 (system program)
export const CROSS_CHAIN_TOKENS: TokenInfo[] = [
    // Solana tokens
    { symbol: "SOL", name: "Solana", chainId: "solana", address: "11111111111111111111111111111111", decimals: 9, icon: "🟣" },
    { symbol: "USDC", name: "USD Coin", chainId: "solana", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, icon: "💵" },
    { symbol: "USDT", name: "Tether", chainId: "solana", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, icon: "💵" },
    { symbol: "BONK", name: "Bonk", chainId: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, icon: "🐕" },
    { symbol: "JUP", name: "Jupiter", chainId: "solana", address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, icon: "🪐" },
    { symbol: "WIF", name: "dogwifhat", chainId: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6, icon: "🎩" },

    // Ethereum tokens (0x0000...0000 = native ETH for LI.FI)
    { symbol: "ETH", name: "Ethereum", chainId: "ethereum", address: "0x0000000000000000000000000000000000000000", decimals: 18, icon: "🔷" },
    { symbol: "USDC", name: "USD Coin", chainId: "ethereum", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, icon: "💵" },
    { symbol: "USDT", name: "Tether", chainId: "ethereum", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, icon: "💵" },
    { symbol: "WETH", name: "Wrapped ETH", chainId: "ethereum", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, icon: "🔷" },

    // BNB Chain tokens
    { symbol: "BNB", name: "BNB", chainId: "bsc", address: "0x0000000000000000000000000000000000000000", decimals: 18, icon: "🟡" },
    { symbol: "USDC", name: "USD Coin", chainId: "bsc", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, icon: "💵" },
    { symbol: "USDT", name: "Tether", chainId: "bsc", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, icon: "💵" },

    // Polygon tokens
    { symbol: "MATIC", name: "Polygon", chainId: "polygon", address: "0x0000000000000000000000000000000000000000", decimals: 18, icon: "🟣" },
    { symbol: "USDC", name: "USD Coin", chainId: "polygon", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, icon: "💵" },
];

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Find a token by symbol and optional chain.
 * If chain is not provided, defaults to Solana.
 */
export function findToken(symbol: string, chainId?: string): TokenInfo | undefined {
    const upper = symbol.toUpperCase();
    const chain = chainId?.toLowerCase() ?? "solana";
    return CROSS_CHAIN_TOKENS.find(t => t.symbol === upper && t.chainId === chain);
}

/**
 * Determine if a swap is cross-chain based on input/output tokens.
 */
export function isCrossChainSwap(inputChainId: string, outputChainId: string): boolean {
    return inputChainId.toLowerCase() !== outputChainId.toLowerCase();
}

/**
 * Get the chain info for a given chain ID.
 */
export function getChain(chainId: string): ChainInfo | undefined {
    return CHAINS[chainId.toLowerCase()];
}

/**
 * List all supported chain IDs.
 */
export function getSupportedChainIds(): string[] {
    return Object.keys(CHAINS);
}
