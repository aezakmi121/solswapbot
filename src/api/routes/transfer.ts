import { Router, Request, Response } from "express";
import { z } from "zod";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";

export const transferRouter = Router();

const confirmTransferSchema = z.object({
    txSignature: z.string().min(1),
    tokenMint: z.string().min(32).max(44),
    tokenSymbol: z.string().optional(),
    humanAmount: z.string().min(1),
    recipientAddress: z.string().min(32).max(44),
});

/**
 * POST /api/transfer/confirm
 * Records a completed outbound transfer in the database.
 * Called by the frontend after Privy successfully signs and sends the TX.
 */
transferRouter.post("/transfer/confirm", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;

        const parsed = confirmTransferSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Invalid parameters" });
            return;
        }

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const { txSignature, tokenMint, tokenSymbol, humanAmount, recipientAddress } =
            parsed.data;

        const transfer = await prisma.transfer.create({
            data: {
                userId: user.id,
                tokenMint,
                tokenSymbol: tokenSymbol ?? null,
                humanAmount,
                recipientAddress,
                txSignature,
                status: "CONFIRMED",
            },
        });

        res.json({ transferId: transfer.id, status: "CONFIRMED" });
    } catch (err) {
        console.error("Transfer confirm error:", err);
        res.status(500).json({ error: "Failed to record transfer" });
    }
});
