import { Router, Request, Response } from "express";
import { getPopularTokens, searchTokens } from "../../jupiter/tokens";

export const tokensRouter = Router();

/**
 * GET /api/tokens
 * Returns popular tokens (SOL, USDC, USDT, etc.) from Jupiter's verified list.
 */
tokensRouter.get("/tokens", async (_req: Request, res: Response) => {
    try {
        const popular = await getPopularTokens();
        const tokens = popular.map((t) => ({
            symbol: t.symbol,
            name: t.name,
            mint: t.address,
            decimals: t.decimals,
            icon: t.logoURI ?? "",
        }));
        res.json({ tokens });
    } catch (err) {
        console.error("Tokens API error:", err);
        res.status(500).json({ error: "Failed to fetch token list" });
    }
});

/**
 * GET /api/tokens/search?query=bonk
 * Searches Jupiter's verified token list by symbol, name, or mint address.
 */
tokensRouter.get("/tokens/search", async (req: Request, res: Response) => {
    try {
        const query = (req.query.query as string) ?? "";
        if (!query.trim()) {
            res.json({ tokens: [] });
            return;
        }

        const results = await searchTokens(query, 20);
        const tokens = results.map((t) => ({
            symbol: t.symbol,
            name: t.name,
            mint: t.address,
            decimals: t.decimals,
            icon: t.logoURI ?? "",
        }));
        res.json({ tokens });
    } catch (err) {
        console.error("Token search error:", err);
        res.status(500).json({ error: "Failed to search tokens" });
    }
});
