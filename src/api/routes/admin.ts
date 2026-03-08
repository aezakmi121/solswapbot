import { Router, Request, Response } from "express";
import { config } from "../../config";
import { prisma } from "../../db/client";
import { getTotalFeesEarned, getFeesForPeriod, getTopFeeGenerators } from "../../db/queries/fees";
import { getReferralEarnings, getReferralCount } from "../../db/queries/referrals";

export const adminRouter = Router();

/**
 * Admin auth guard — checks that the authenticated telegramId matches ADMIN_TELEGRAM_ID.
 * If ADMIN_TELEGRAM_ID is not set, all admin routes return 503 (not configured).
 */
function isAdmin(res: Response): boolean {
    const adminId = config.ADMIN_TELEGRAM_ID;
    if (!adminId) {
        res.status(503).json({ error: "Admin routes not configured — set ADMIN_TELEGRAM_ID" });
        return false;
    }
    const telegramId = res.locals.telegramId as string;
    if (telegramId !== adminId) {
        res.status(403).json({ error: "Admin access required" });
        return false;
    }
    return true;
}

/**
 * GET /api/admin/stats
 * Dashboard overview: total users, swaps, fees earned (all-time + periodic).
 */
adminRouter.get("/admin/stats", async (_req: Request, res: Response) => {
    if (!isAdmin(res)) return;

    try {
        const [totalUsers, totalSwaps, totalFeesEarned, feesToday, fees7d, fees30d] = await Promise.all([
            prisma.user.count(),
            prisma.swap.count({ where: { status: "CONFIRMED" } }),
            getTotalFeesEarned(),
            getFeesForPeriod(1),
            getFeesForPeriod(7),
            getFeesForPeriod(30),
        ]);

        res.json({
            totalUsers,
            totalSwaps,
            totalFeesUsd: Number(totalFeesEarned),
            feesToday,
            fees7d,
            fees30d,
        });
    } catch (err) {
        console.error("Admin stats error:", err);
        res.status(500).json({ error: "Failed to fetch admin stats" });
    }
});

/**
 * GET /api/admin/referrals
 * Top referrers by earnings + total referral chain stats.
 */
adminRouter.get("/admin/referrals", async (_req: Request, res: Response) => {
    if (!isAdmin(res)) return;

    try {
        // Get all users who have referred at least 1 person
        const referrers = await prisma.user.findMany({
            where: { referrals: { some: {} } },
            select: {
                id: true,
                telegramId: true,
                telegramUsername: true,
                _count: { select: { referrals: true } },
            },
            orderBy: { referrals: { _count: "desc" } },
            take: 20,
        });

        // Enrich with earnings
        const enriched = await Promise.all(
            referrers.map(async (r) => {
                const earnings = await getReferralEarnings(r.id, config.REFERRAL_FEE_SHARE_PERCENT);
                return {
                    telegramId: r.telegramId,
                    telegramUsername: r.telegramUsername,
                    referralCount: r._count.referrals,
                    earningsUsd: earnings,
                };
            })
        );

        const totalReferrals = await prisma.user.count({ where: { referredById: { not: null } } });

        res.json({
            topReferrers: enriched,
            totalReferrals,
            feeSharePercent: config.REFERRAL_FEE_SHARE_PERCENT,
        });
    } catch (err) {
        console.error("Admin referrals error:", err);
        res.status(500).json({ error: "Failed to fetch referral stats" });
    }
});

/**
 * GET /api/admin/users?limit=20
 * Latest users with their swap count and fees generated.
 */
adminRouter.get("/admin/users", async (req: Request, res: Response) => {
    if (!isAdmin(res)) return;

    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

        const users = await prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            take: limit,
            include: {
                _count: { select: { swaps: true, transfers: true, scans: true, referrals: true } },
            },
        });

        const topFeeGenerators = await getTopFeeGenerators(10);
        const totalUsers = await prisma.user.count();

        res.json({
            users: users.map((u: any) => ({
                telegramId: u.telegramId,
                telegramUsername: u.telegramUsername,
                walletAddress: u.walletAddress ? `${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}` : null,
                hasEvmWallet: !!u.evmWalletAddress,
                swapCount: u._count.swaps,
                sendCount: u._count.transfers,
                scanCount: u._count.scans,
                referralCount: u._count.referrals,
                joinedAt: u.createdAt.toISOString(),
            })),
            topFeeGenerators,
            totalUsers,
        });
    } catch (err) {
        console.error("Admin users error:", err);
        res.status(500).json({ error: "Failed to fetch user stats" });
    }
});
