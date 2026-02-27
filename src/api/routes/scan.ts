import { Router, Request, Response } from "express";
import { analyzeToken } from "../../scanner/analyze";
import { isValidPublicKey } from "../../utils/validation";
import { prisma } from "../../db/client";
import { findUserByTelegramId } from "../../db/queries/users";

export const scanRouter = Router();

/**
 * GET /api/scan?mint=<ADDRESS>
 * Returns a full safety analysis of the given Solana token.
 * Also saves the result to the DB for scan history.
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

        // Save scan to DB for history (best effort — don't fail the response if DB write fails)
        try {
            const telegramId = res.locals.telegramId as string;
            const user = await findUserByTelegramId(telegramId);
            if (user) {
                await prisma.tokenScan.create({
                    data: {
                        userId: user.id,
                        mintAddress: mint,
                        tokenName: result.tokenInfo.name ?? undefined,
                        tokenSymbol: result.tokenInfo.symbol ?? undefined,
                        riskScore: result.riskScore,
                        riskLevel: result.riskLevel,
                        flags: JSON.stringify(
                            result.checks
                                .filter((c) => !c.safe && !c.errored)
                                .map((c) => c.name)
                        ),
                    },
                });
            }
        } catch (dbErr) {
            // Non-fatal — log but continue returning the scan result
            console.error("Failed to save scan to DB:", dbErr);
        }

        res.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Scan API error:", message);
        res.status(500).json({ error: "Failed to analyze token" });
    }
});

/**
 * GET /api/scan/history
 * Returns the authenticated user's last 10 token scans from the DB.
 */
scanRouter.get("/scan/history", async (_req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const user = await findUserByTelegramId(telegramId);

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const scans = await prisma.tokenScan.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 10,
        });

        res.json({
            scans: scans.map((s) => ({
                id: s.id,
                mintAddress: s.mintAddress,
                tokenName: s.tokenName,
                tokenSymbol: s.tokenSymbol,
                riskScore: s.riskScore,
                riskLevel: s.riskLevel,
                createdAt: s.createdAt.toISOString(),
            })),
        });
    } catch (err) {
        console.error("Scan history API error:", err);
        res.status(500).json({ error: "Failed to fetch scan history" });
    }
});
