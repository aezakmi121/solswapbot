import { Router, Request, Response } from "express";
import { TOKENS, TOKEN_DECIMALS } from "../../utils/constants";

export const tokensRouter = Router();

/** Token metadata for the Mini App frontend */
interface TokenInfo {
    symbol: string;
    mint: string;
    decimals: number;
    icon: string;
}

const TOKEN_ICONS: Record<string, string> = {
    SOL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    USDC: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    USDT: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
    BONK: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I",
    WIF: "https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betiez7oz4nqp5utgt754.ipfs.nftstorage.link",
    JUP: "https://static.jup.ag/jup/icon.png",
};

/**
 * GET /api/tokens
 * Returns the list of supported tokens with metadata.
 */
tokensRouter.get("/tokens", (_req: Request, res: Response) => {
    const tokens: TokenInfo[] = Object.entries(TOKENS).map(([symbol, mint]) => ({
        symbol,
        mint,
        decimals: TOKEN_DECIMALS[symbol] ?? 9,
        icon: TOKEN_ICONS[symbol] ?? "",
    }));

    res.json({ tokens });
});
