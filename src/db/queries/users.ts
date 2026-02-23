import { prisma } from "../client";

/** Find a user by their Telegram ID */
export function findUserByTelegramId(telegramId: string) {
  return prisma.user.findUnique({ where: { telegramId } });
}

/** Find a user by their referral code */
export function findUserByReferralCode(referralCode: string) {
  return prisma.user.findUnique({ where: { referralCode } });
}

/** Create a new user, optionally linking them to a referrer */
export function createUser(params: {
  telegramId: string;
  telegramUsername?: string;
  referredById?: string;
}) {
  return prisma.user.create({
    data: {
      telegramId: params.telegramId,
      telegramUsername: params.telegramUsername ?? null,
      referredById: params.referredById ?? null,
    },
  });
}

/** Update a user's connected wallet address */
export function updateUserWallet(telegramId: string, walletAddress: string) {
  return prisma.user.update({
    where: { telegramId },
    data: { walletAddress },
  });
}

/** Get a user with their referral count */
export async function getUserWithReferralCount(telegramId: string) {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { _count: { select: { referrals: true } } },
  });
  return user;
}
