import { Router, Request, Response } from "express";
import { buildSwapTransaction } from "../../jupiter/swap";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";
import { pollTransactionInBackground } from "../../solana/transaction";
import { isValidSolanaAddress } from "../../utils/validation";

export const swapRouter = Router();

/**
 * POST /api/swap
 * Builds a swap transaction from a quote. Returns base64 serialized tx
 * for the Mini App to sign via Privy embedded wallet.
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

/**
 * POST /api/swap/confirm
 * Called by the frontend after the user signs and sends the transaction.
 * Creates a swap record in the DB and starts background confirmation polling.
 *
 * Body: { telegramId, txSignature, inputMint, outputMint, inputAmount, outputAmount, feeAmountUsd? }
 */
swapRouter.post("/swap/confirm", async (req: Request, res: Response) => {
    try {
        const { telegramId, txSignature, inputMint, outputMint, inputAmount, outputAmount, feeAmountUsd } = req.body;

        if (!telegramId || !txSignature || !inputMint || !outputMint || !inputAmount || !outputAmount) {
            res.status(400).json({ error: "Missing required fields" });
            return;
        }

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // Create the swap record
        const swap = await prisma.swap.create({
            data: {
                userId: user.id,
                inputMint,
                outputMint,
                inputAmount: BigInt(inputAmount),
                outputAmount: BigInt(outputAmount),
                feeAmountUsd: feeAmountUsd ?? null,
                txSignature,
                status: "SUBMITTED",
            },
        });

        // Start background polling for on-chain confirmation
        pollTransactionInBackground(swap.id, txSignature, (result) => {
            console.log(`Swap ${swap.id} confirmation result: ${result}`);
        });

        res.json({ swapId: swap.id, status: "SUBMITTED" });
    } catch (err) {
        console.error("Swap confirm error:", err);
        res.status(500).json({ error: "Failed to record swap" });
    }
});

/**
 * GET /api/swap/status?swapId=<ID>
 * Returns the current confirmation status of a swap.
 */
swapRouter.get("/swap/status", async (req: Request, res: Response) => {
    try {
        const swapId = req.query.swapId as string;

        if (!swapId) {
            res.status(400).json({ error: "Missing swapId" });
            return;
        }

        const swap = await prisma.swap.findUnique({
            where: { id: swapId },
            select: { id: true, status: true, txSignature: true },
        });

        if (!swap) {
            res.status(404).json({ error: "Swap not found" });
            return;
        }

        res.json({
            swapId: swap.id,
            status: swap.status,
            txSignature: swap.txSignature,
        });
    } catch (err) {
        console.error("Swap status error:", err);
        res.status(500).json({ error: "Failed to fetch swap status" });
    }
});
