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
