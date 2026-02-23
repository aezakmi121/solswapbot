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

  const totalFees = result._sum.feeAmountUsd ?? 0;
  return totalFees * (feeSharePercent / 100);
}

/** Count how many users were referred by a given user */
export function getReferralCount(userId: string) {
  return prisma.user.count({ where: { referredById: userId } });
}
