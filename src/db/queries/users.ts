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

/**
 * Upsert user: create if new, update username if existing.
 * Returns { user, isNew } — avoids TOCTOU race condition (H6).
 */
export async function upsertUser(params: {
  telegramId: string;
  telegramUsername?: string;
  referredById?: string;
}): Promise<{ user: Awaited<ReturnType<typeof prisma.user.upsert>>; isNew: boolean }> {
  // Check if user exists first to determine isNew status
  const existing = await prisma.user.findUnique({ where: { telegramId: params.telegramId } });

  const user = await prisma.user.upsert({
    where: { telegramId: params.telegramId },
    update: {
      telegramUsername: params.telegramUsername ?? undefined,
    },
    create: {
      telegramId: params.telegramId,
      telegramUsername: params.telegramUsername ?? null,
      referredById: params.referredById ?? null,
    },
  });

  return { user, isNew: !existing };
}

/** Update a user's connected Solana wallet address */
export function updateUserWallet(telegramId: string, walletAddress: string) {
  return prisma.user.update({
    where: { telegramId },
    data: { walletAddress },
  });
}

/** Update a user's Privy-managed EVM embedded wallet address */
export function updateUserEvmWallet(telegramId: string, evmWalletAddress: string) {
  return prisma.user.update({
    where: { telegramId },
    data: { evmWalletAddress },
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

/**
 * Delete a user and all their related data (GDPR Right to Erasure).
 * Uses a transaction to ensure atomicity — either everything is deleted or nothing.
 * Unlinks referrals (sets referredById to null) rather than cascade-deleting referred users.
 */
export async function deleteUserAndData(telegramId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return false;

  await prisma.$transaction([
    // Unlink users who were referred by this user (don't delete them)
    prisma.user.updateMany({
      where: { referredById: user.id },
      data: { referredById: null },
    }),
    // Delete all owned records
    prisma.swap.deleteMany({ where: { userId: user.id } }),
    prisma.transfer.deleteMany({ where: { userId: user.id } }),
    prisma.tokenScan.deleteMany({ where: { userId: user.id } }),
    prisma.watchedWallet.deleteMany({ where: { userId: user.id } }),
    prisma.subscription.deleteMany({ where: { userId: user.id } }),
    // Delete the user last
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  return true;
}
