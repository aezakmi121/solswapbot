import { Router, Request, Response } from "express";
import { buildSwapTransaction } from "../../jupiter/swap";
import { config } from "../../config";

export const swapRouter = Router();

/**
 * POST /api/swap
 * Builds a swap transaction from a quote. Returns base64 serialized tx
 * for the Mini App to sign via wallet-adapter.
 *
 * Body: { quoteResponse, userPublicKey }
 */
swapRouter.post("/swap", async (req: Request, res: Response) => {
    try {
        const { quoteResponse, userPublicKey } = req.body;

        if (!quoteResponse || !userPublicKey) {
            res.status(400).json({ error: "Missing quoteResponse or userPublicKey" });
            return;
        }

        const swapResult = await buildSwapTransaction({
            quoteResponse,
            userPublicKey,
        });

        res.json({
            swapTransaction: swapResult.swapTransaction,
            lastValidBlockHeight: swapResult.lastValidBlockHeight,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Swap API error:", message);
        res.status(500).json({ error: "Failed to build swap transaction" });
    }
});
