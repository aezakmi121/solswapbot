import { Router, Request, Response } from "express";
import { buildSwapTransaction } from "../../jupiter/swap";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";
import { pollTransactionInBackground } from "../../solana/transaction";
import { config } from "../../config";

/** Regex: non-negative integer string (for BigInt validation) */
const BIGINT_RE = /^(0|[1-9]\d*)$/;

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

        // H1: Validate that platformFeeBps is PRESENT and correct.
        // An attacker could strip platformFee entirely to get zero-fee swaps.
        if (!quoteResponse.platformFee || quoteResponse.platformFee.feeBps !== config.PLATFORM_FEE_BPS) {
            res.status(400).json({ error: "Invalid or missing platform fee in quote" });
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
 * telegramId from verified initData — no spoofing possible (C2).
 *
 * Body: { txSignature, inputMint, outputMint, inputAmount, outputAmount, feeAmountUsd? }
 */
swapRouter.post("/swap/confirm", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const { txSignature, inputMint, outputMint, inputAmount, outputAmount, feeAmountUsd } = req.body;

        if (!txSignature || !inputMint || !outputMint || !inputAmount || !outputAmount) {
            res.status(400).json({ error: "Missing required fields" });
            return;
        }

        // H2: Validate BigInt inputs before conversion to prevent crash on malformed strings
        if (!BIGINT_RE.test(String(inputAmount)) || !BIGINT_RE.test(String(outputAmount))) {
            res.status(400).json({ error: "Invalid amount: must be a non-negative integer string" });
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
 * H1: Enforces user ownership — users can only query their own swaps.
 */
swapRouter.get("/swap/status", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const swapId = req.query.swapId as string;

        if (!swapId) {
            res.status(400).json({ error: "Missing swapId" });
            return;
        }

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // H1: Only return swaps owned by the authenticated user
        const swap = await prisma.swap.findFirst({
            where: { id: swapId, userId: user.id },
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
