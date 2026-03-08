import { prisma } from "../client";

/** Get total platform fees earned (across all confirmed swaps) */
export async function getTotalFeesEarned() {
  const result = await prisma.swap.aggregate({
    where: { status: "CONFIRMED", feeAmountUsd: { not: null } },
    _sum: { feeAmountUsd: true },
  });
  return result._sum.feeAmountUsd ?? 0;
}

/** Get fee earnings for a specific user's swaps */
export async function getUserFeesGenerated(userId: string) {
  const result = await prisma.swap.aggregate({
    where: { userId, status: "CONFIRMED", feeAmountUsd: { not: null } },
    _sum: { feeAmountUsd: true },
  });
  return result._sum.feeAmountUsd ?? 0;
}

/** Get total fees earned in a time period (last N days) */
export async function getFeesForPeriod(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const result = await prisma.swap.aggregate({
    where: { status: "CONFIRMED", feeAmountUsd: { not: null }, createdAt: { gte: since } },
    _sum: { feeAmountUsd: true },
    _count: true,
  });
  return { totalUsd: Number(result._sum.feeAmountUsd ?? 0), swapCount: result._count };
}

/** Get top fee-generating users */
export async function getTopFeeGenerators(limit: number = 10) {
  const results = await prisma.swap.groupBy({
    by: ["userId"],
    where: { status: "CONFIRMED", feeAmountUsd: { not: null } },
    _sum: { feeAmountUsd: true },
    _count: true,
    orderBy: { _sum: { feeAmountUsd: "desc" } },
    take: limit,
  });

  // Enrich with user info
  const enriched = await Promise.all(
    results.map(async (r) => {
      const user = await prisma.user.findUnique({
        where: { id: r.userId },
        select: { telegramId: true, telegramUsername: true },
      });
      return {
        userId: r.userId,
        telegramId: user?.telegramId ?? "?",
        telegramUsername: user?.telegramUsername ?? null,
        totalFeesUsd: Number(r._sum.feeAmountUsd ?? 0),
        swapCount: r._count,
      };
    })
  );

  return enriched;
}
