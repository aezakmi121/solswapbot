import { Router, Request, Response } from "express";
import { analyzeToken, ScanResult } from "../../scanner/analyze";
import { analyzeEvmToken, resolveEvmChain } from "../../scanner/evmAnalyze";
import { isValidPublicKey, isValidEvmAddress } from "../../utils/validation";
import { prisma } from "../../db/client";
import { findUserByTelegramId } from "../../db/queries/users";
import { config } from "../../config";

export const scanRouter = Router();

/**
 * GET /api/scan?mint=<ADDRESS>&chain=<CHAIN>
 * Returns a full safety analysis of the given token.
 * Auto-detects chain from address format:
 *   - 0x... → EVM (chain param: ethereum|bsc|polygon|arbitrum|base, default: ethereum)
 *   - Base58 → Solana
 * Also saves the result to the DB for scan history.
 */
scanRouter.get("/scan", async (req: Request, res: Response) => {
    try {
        const mint = (req.query.mint as string)?.trim();
        const chainHint = req.query.chain as string | undefined;

        if (!mint) {
            res.status(400).json({ error: "Missing 'mint' query parameter" });
            return;
        }

        // Detect chain from address format
        const isEvm = isValidEvmAddress(mint);
        const isSolana = !isEvm && isValidPublicKey(mint);

        if (!isEvm && !isSolana) {
            res.status(400).json({ error: "Invalid token address. Provide a Solana mint or EVM contract address (0x...)" });
            return;
        }

        // ── Scanner daily limit ────────────────────────────────────────
        const telegramId = res.locals.telegramId as string;
        const user = await findUserByTelegramId(telegramId);

        const isAdmin = !!(config.ADMIN_TELEGRAM_ID && telegramId === config.ADMIN_TELEGRAM_ID);
        console.log(`[scan] telegramId=${telegramId}, chain=${isEvm ? "evm" : "solana"}, isAdmin=${isAdmin}`);

        const FREE_SCANS_PER_DAY = 10;
        if (user && !isAdmin) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const todayScans = await prisma.tokenScan.count({
                where: { userId: user.id, createdAt: { gte: todayStart } },
            });

            if (todayScans >= FREE_SCANS_PER_DAY) {
                const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
                const isExpired = sub?.expiresAt && sub.expiresAt < new Date();
                if (!sub || sub.tier === "FREE" || isExpired) {
                    res.status(429).json({
                        error: "Daily scan limit reached (10 free scans/day)",
                        todayScans,
                        limit: FREE_SCANS_PER_DAY,
                        upgradeHint: "Upgrade to Scanner Pro for unlimited scans",
                    });
                    return;
                }
            }
        }

        // Route to the correct scanner
        let result: ScanResult;
        if (isEvm) {
            const chain = resolveEvmChain(chainHint);
            result = await analyzeEvmToken(mint.toLowerCase(), chain);
        } else {
            result = await analyzeToken(mint);
        }

        // Save scan to DB for history (best effort)
        try {
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
