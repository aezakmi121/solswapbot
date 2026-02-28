import { Router, Request, Response } from "express";
import { getTokenPriceUsd } from "../../jupiter/price";
import { isValidPublicKey } from "../../utils/validation";

export const priceRouter = Router();

/**
 * GET /api/price/:mint
 * Returns the USD price of a token by its mint address.
 */
priceRouter.get("/price/:mint", async (req: Request, res: Response) => {
    try {
        const mint = req.params.mint as string;

        // M1: Use proper Solana public key validation (not just length check)
        if (!mint || !isValidPublicKey(mint)) {
            res.status(400).json({ error: "Invalid mint address" });
            return;
        }

        const price = await getTokenPriceUsd(mint);

        if (price === null) {
            res.status(404).json({ error: "Price not found for this token" });
            return;
        }

        res.json({ mint, priceUsd: price });
    } catch (err) {
        console.error("Price API error:", err);
        res.status(500).json({ error: "Failed to fetch price" });
    }
});
