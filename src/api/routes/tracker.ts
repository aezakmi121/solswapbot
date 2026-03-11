import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { prisma } from "../../db/client";
import { config } from "../../config";
import { connection } from "../../solana/connection";
import { addAddressToWebhook } from "../../helius/client";
import { addAddressToMoralisStream, removeAddressFromMoralisStream } from "../../moralis/stream";
import { getEvmPortfolio } from "../../moralis/client";
import { getTokenPricesBatch } from "../../jupiter/price";
import { getTokensMetadata } from "../../jupiter/tokens";

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
        let { walletAddress, label, chain } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: "Missing walletAddress" });
            return;
        }

        chain = chain || "solana";

        // Validate address format based on chain
        if (chain === "solana") {
            if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
                res.status(400).json({ error: "Invalid Solana wallet address" });
                return;
            }
        } else {
            // EVM validation
            if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
                res.status(400).json({ error: "Invalid EVM wallet address" });
                return;
            }
            walletAddress = walletAddress.toLowerCase(); // Lowercase for SQLite case-insensitivity consistency
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
                chain,
            },
        });

        // Register with appropriate real-time webhook provider
        if (chain === "solana") {
            addAddressToWebhook(walletAddress).catch((e: Error) => console.error("Helius watch error", e));
        } else {
            addAddressToMoralisStream(walletAddress).catch((e: Error) => console.error("Moralis watch error", e));
        }

        res.json({
            success: true,
            wallet: {
                id: watched.id,
                walletAddress: watched.walletAddress,
                label: watched.label,
                chain: watched.chain,
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
        let { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: "Missing walletAddress" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // If it looks like an EVM address, lowercase it for strict equality matching
        if (/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            walletAddress = walletAddress.toLowerCase();
        }

        // Find existing to know which chain it is for webhook cleanup
        const existing = await prisma.watchedWallet.findFirst({
            where: { userId: user.id, walletAddress }
        });

        if (existing) {
            await prisma.watchedWallet.update({
                where: { id: existing.id },
                data: { active: false },
            });

            // Remove from Moralis stream (EVM)
            if (existing.chain !== "solana") {
                removeAddressFromMoralisStream(existing.walletAddress).catch((e: Error) => console.error("Moralis unwatch", e));
            }
            // Note: Helius doesn't have a direct remove endpoint yet, it just keeps pushing to us and we filter it out.
        }

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
                chain: w.chain,
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

/**
 * GET /api/tracker/portfolio/:walletAddress
 * Fetches the top 10 tokens (by USD value) for a watched wallet.
 * Includes 24h PnL price changes.
 */
trackerRouter.get("/tracker/portfolio/:walletAddress", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        let walletAddress = req.params.walletAddress as string;

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // Validate wallet format and lowercase EVM
        if (/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            walletAddress = walletAddress.toLowerCase();
        }

        // 1. Verify user is actually watching this wallet
        const watchedWallet = await prisma.watchedWallet.findFirst({
            where: { userId: user.id, walletAddress, active: true }
        });

        if (!watchedWallet) {
            res.status(403).json({ error: "You are not watching this wallet." });
            return;
        }

        const chain = watchedWallet.chain;
        let tokens: any[] = [];

        // 2. Fetch Portfolio based on chain
        if (chain === "solana") {
            const pubkey = new PublicKey(walletAddress);
            const WSOL_MINT = "So11111111111111111111111111111111111111112";

            const [lamports, tokenAccounts] = await Promise.all([
                connection.getBalance(pubkey),
                connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
            ]);

            const balanceMap = new Map<string, { amount: number; decimals: number }>();
            if (lamports > 0) {
                balanceMap.set(WSOL_MINT, { amount: lamports / 1e9, decimals: 9 });
            }

            for (const account of tokenAccounts.value) {
                const info = account.account.data.parsed.info;
                const uiAmount = info.tokenAmount.uiAmount;
                if (uiAmount > 0) {
                    const existing = balanceMap.get(info.mint);
                    if (existing) {
                        existing.amount += uiAmount;
                    } else {
                        balanceMap.set(info.mint, {
                            amount: uiAmount,
                            decimals: info.tokenAmount.decimals,
                        });
                    }
                }
            }

            const mints = [...balanceMap.keys()];
            const [prices, metadata] = await Promise.all([
                getTokenPricesBatch(mints),
                getTokensMetadata(mints),
            ]);

            tokens = mints.map((mint) => {
                const bal = balanceMap.get(mint)!;
                const priceData = prices[mint];
                const priceUsd = priceData?.priceUsd ?? null;
                const priceChange24h = priceData?.priceChange24h ?? null;
                const info = metadata[mint];
                
                return {
                    chain: "solana",
                    mint,
                    symbol: info?.symbol ?? mint.slice(0, 6),
                    name: info?.name ?? "Unknown Token",
                    icon: info?.logoURI ?? null,
                    amount: bal.amount,
                    decimals: bal.decimals,
                    priceUsd,
                    priceChange24h,
                    valueUsd: priceUsd !== null ? bal.amount * priceUsd : null,
                };
            });

        } else {
            // EVM Chain
            // getEvmPortfolio already fetches all networks, so we filter down to just the requested chain
            const allEvmTokens = await getEvmPortfolio(walletAddress);
            
            // Map moralis chain names ("ethereum", "bsc", "polygon", "arbitrum", "base")
            tokens = allEvmTokens.filter(t => t.chain.toLowerCase() === chain.toLowerCase());
        }

        // 3. Calculate metrics and sort
        const totalValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0);
        
        // Sort descending by USD value
        tokens.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
        
        // Take Top 10
        const topTokens = tokens.slice(0, 10);

        res.json({
            walletAddress,
            chain,
            totalValueUsd,
            tokens: topTokens
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Fetch portfolio error:", message);
        res.status(500).json({ error: "Failed to fetch portfolio" });
    }
});
