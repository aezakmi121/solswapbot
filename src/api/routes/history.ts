import { Router, Request, Response } from "express";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";
import { getTokensMetadata } from "../../jupiter/tokens";

export const historyRouter = Router();

/**
 * GET /api/history
 * Returns the user's last 20 swaps.
 * telegramId extracted from verified initData by auth middleware.
 */
historyRouter.get("/history", async (_req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const swaps = await prisma.swap.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 20,
        });

        // Batch-resolve all mint symbols in a single token list lookup (M3: avoid N+1)
        const uniqueMints = [...new Set(swaps.flatMap((s) => [s.inputMint, s.outputMint]))];
        const metadata = await getTokensMetadata(uniqueMints);
        const mintToSymbol = (mint: string): string =>
            metadata[mint]?.symbol ?? mint.slice(0, 6) + "...";

        const formatted = swaps.map((swap) => ({
            id: swap.id,
            inputMint: swap.inputMint,
            outputMint: swap.outputMint,
            inputSymbol: mintToSymbol(swap.inputMint),
            outputSymbol: mintToSymbol(swap.outputMint),
            inputAmount: swap.inputAmount.toString(),
            outputAmount: swap.outputAmount.toString(),
            feeAmountUsd: swap.feeAmountUsd,
            txSignature: swap.txSignature,
            status: swap.status,
            createdAt: swap.createdAt.toISOString(),
        }));

        res.json({ swaps: formatted });
    } catch (err) {
        console.error("History API error:", err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});
