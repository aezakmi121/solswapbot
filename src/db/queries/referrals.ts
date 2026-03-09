import { prisma } from "../client";

/** Get total fee earnings from swaps made by a user's referrals */
export async function getReferralEarnings(userId: string, feeSharePercent: number) {
  const result = await prisma.swap.aggregate({
    where: {
      user: { referredById: userId },
      status: "CONFIRMED",
      feeAmountUsd: { not: null },
    },
    _sum: { feeAmountUsd: true },
  });

  const totalFees = result._sum.feeAmountUsd?.toNumber() ?? 0;
  return totalFees * (feeSharePercent / 100);
}

/** Count how many users were referred by a given user */
export function getReferralCount(userId: string) {
  return prisma.user.count({ where: { referredById: userId } });
}

/** Referred user info for the referral dashboard */
export interface ReferralListItem {
  telegramUsername: string | null;
  joinedAt: string;
  swapCount: number;
  feesGeneratedUsd: number;
}

/**
 * Get paginated list of users referred by a given user.
 * Returns username, join date, swap count, and fees generated per referral.
 * Privacy: only shows username, never wallet address.
 */
export async function getReferralList(
  userId: string,
  feeSharePercent: number,
  offset = 0,
  limit = 20
): Promise<{ referrals: ReferralListItem[]; total: number }> {
  const [referrals, total] = await Promise.all([
    prisma.user.findMany({
      where: { referredById: userId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        telegramUsername: true,
        createdAt: true,
        _count: { select: { swaps: true } },
        swaps: {
          where: { status: "CONFIRMED", feeAmountUsd: { not: null } },
          select: { feeAmountUsd: true },
        },
      },
    }),
    prisma.user.count({ where: { referredById: userId } }),
  ]);

  const items: ReferralListItem[] = referrals.map((r) => {
    const totalFees = r.swaps.reduce(
      (sum, s) => sum + (s.feeAmountUsd?.toNumber() ?? 0),
      0
    );
    return {
      telegramUsername: r.telegramUsername,
      joinedAt: r.createdAt.toISOString(),
      swapCount: r._count.swaps,
      feesGeneratedUsd: totalFees * (feeSharePercent / 100),
    };
  });

  return { referrals: items, total };
}
