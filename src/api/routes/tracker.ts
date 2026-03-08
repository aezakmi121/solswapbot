import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";

export const trackerRouter = Router();

/**
 * POST /api/tracker/watch
 * Add a wallet to the user's watch list.
 *
 * Body: { telegramId, walletAddress, label? }
 */
trackerRouter.post("/tracker/watch", async (req: Request, res: Response) => {
    try {
        const { telegramId, walletAddress, label } = req.body;

        if (!telegramId || !walletAddress) {
            res.status(400).json({ error: "Missing telegramId or walletAddress" });
            return;
        }

        // Validate Solana address format (base58, 32-44 chars)
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
            res.status(400).json({ error: "Invalid Solana wallet address" });
            return;
        }

        // Find or create user
        const user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
        if (!user) {
            res.status(404).json({ error: "User not found. Send /start to the bot first." });
            return;
        }

        // Check limit (free tier: 3 wallets)
        const existingCount = await prisma.watchedWallet.count({
            where: { userId: user.id, active: true },
        });

        if (existingCount >= 3) {
            res.status(403).json({
                error: "Free tier limit: 3 watched wallets. Upgrade to track more!",
                currentCount: existingCount,
            });
            return;
        }

        // Upsert — reactivate if previously unwatched
        const watched = await prisma.watchedWallet.upsert({
            where: {
                userId_walletAddress: { userId: user.id, walletAddress },
            },
            update: { active: true, label: label ?? undefined },
            create: {
                userId: user.id,
                walletAddress,
                label: label ?? null,
            },
        });

        res.json({
            success: true,
            wallet: {
                id: watched.id,
                walletAddress: watched.walletAddress,
                label: watched.label,
                active: watched.active,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Watch wallet error:", message);
        res.status(500).json({ error: "Failed to watch wallet" });
    }
});

/**
 * POST /api/tracker/unwatch
 * Remove a wallet from the user's watch list (soft delete — sets active=false).
 *
 * Body: { telegramId, walletAddress }
 */
trackerRouter.post("/tracker/unwatch", async (req: Request, res: Response) => {
    try {
        const { telegramId, walletAddress } = req.body;

        if (!telegramId || !walletAddress) {
            res.status(400).json({ error: "Missing telegramId or walletAddress" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        await prisma.watchedWallet.updateMany({
            where: { userId: user.id, walletAddress },
            data: { active: false },
        });

        res.json({ success: true, walletAddress });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Unwatch wallet error:", message);
        res.status(500).json({ error: "Failed to unwatch wallet" });
    }
});

/**
 * GET /api/tracker/list?telegramId=xxx
 * List all watched wallets for a user.
 */
trackerRouter.get("/tracker/list", async (req: Request, res: Response) => {
    try {
        const telegramId = req.query.telegramId as string;

        if (!telegramId) {
            res.status(400).json({ error: "Missing telegramId" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const wallets = await prisma.watchedWallet.findMany({
            where: { userId: user.id, active: true },
            orderBy: { createdAt: "desc" },
        });

        res.json({
            wallets: wallets.map(w => ({
                id: w.id,
                walletAddress: w.walletAddress,
                label: w.label,
                createdAt: w.createdAt,
            })),
            count: wallets.length,
            limit: 3,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("List wallets error:", message);
        res.status(500).json({ error: "Failed to list wallets" });
    }
});
