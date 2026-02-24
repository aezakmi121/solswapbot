import { Router, Request, Response } from "express";
import { analyzeToken } from "../../scanner/analyze";
import { isValidPublicKey } from "../../utils/validation";

export const scanRouter = Router();

/**
 * GET /api/scan?mint=<ADDRESS>
 * Returns a full safety analysis of the given Solana token.
 * Used by the Mini App "Scan" tab.
 */
scanRouter.get("/scan", async (req: Request, res: Response) => {
    try {
        const mint = req.query.mint as string;

        if (!mint) {
            res.status(400).json({ error: "Missing 'mint' query parameter" });
            return;
        }

        if (!isValidPublicKey(mint)) {
            res.status(400).json({ error: "Invalid Solana address" });
            return;
        }

        const result = await analyzeToken(mint);

        res.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Scan API error:", message);
        res.status(500).json({ error: "Failed to analyze token" });
    }
});
