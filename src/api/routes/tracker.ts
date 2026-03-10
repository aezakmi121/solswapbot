import { Router, Request, Response } from "express";
import { prisma } from "../../db/client";
import { config } from "../../config";

export const trackerRouter = Router();

/** Wallet limits per subscription tier */
const WALLET_LIMITS = {
    free:     3,   // Free users: 3 wallets
    paid:     20,  // WHALE_TRACKER / ALL_ACCESS subscribers: 20 wallets
    admin:    Infinity, // Admin: unlimited
} as const;

/**
 * Returns the wallet limit for a given user.
 * Admin > Paid subscriber > Free
 */
async function getWalletLimit(telegramId: string, userId: string): Promise<number> {
    // Admin bypass
    if (config.ADMIN_TELEGRAM_ID && telegramId === config.ADMIN_TELEGRAM_ID) {
        return WALLET_LIMITS.admin;
    }
    // Check subscription tier
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    const isPaid = sub && (sub.tier === "WHALE_TRACKER" || sub.tier === "ALL_ACCESS");
    return isPaid ? WALLET_LIMITS.paid : WALLET_LIMITS.free;
}

/**
 * POST /api/tracker/watch
 * Add a wallet to the user's watch list.
 * Auth: Telegram initData via telegramAuthMiddleware (res.locals.telegramId).
 *
 * Body: { walletAddress, label? }
 */
trackerRouter.post("/tracker/watch", async (req: Request, res: Response) => {
    try {
        // Use verified telegramId from auth middleware — never from req.body (prevents spoofing)
        const telegramId = res.locals.telegramId as string;
        const { walletAddress, label } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: "Missing walletAddress" });
            return;
        }

        // Validate Solana address format (base58, 32-44 chars)
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
            res.status(400).json({ error: "Invalid Solana wallet address" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            res.status(404).json({ error: "User not found. Send /start to the bot first." });
            return;
        }

        const limit = await getWalletLimit(telegramId, user.id);

        // Check against the user's tier limit
        const existingCount = await prisma.watchedWallet.count({
            where: { userId: user.id, active: true },
        });

        if (existingCount >= limit) {
            const isAdmin = limit === WALLET_LIMITS.admin;
            const limitDisplay = isAdmin ? "unlimited" : String(limit);
            res.status(403).json({
                error: limit === WALLET_LIMITS.free
                    ? `Free tier: max ${WALLET_LIMITS.free} watched wallets. Upgrade to Whale Tracker for ${WALLET_LIMITS.paid}!`
                    : `Limit reached: ${limitDisplay} wallets for your tier`,
                currentCount: existingCount,
                limit: limit === Infinity ? null : limit,
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
 * Remove a wallet from the user's watch list (soft delete).
 * Auth: Telegram initData via telegramAuthMiddleware.
 *
 * Body: { walletAddress }
 */
trackerRouter.post("/tracker/unwatch", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: "Missing walletAddress" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
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
 * GET /api/tracker/list
 * List all watched wallets for the authenticated user.
 * Auth: Telegram initData via telegramAuthMiddleware.
 */
trackerRouter.get("/tracker/list", async (_req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const limit = await getWalletLimit(telegramId, user.id);

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
            limit: limit === Infinity ? null : limit,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("List wallets error:", message);
        res.status(500).json({ error: "Failed to list wallets" });
    }
});
