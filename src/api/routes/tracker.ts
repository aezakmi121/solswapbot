import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
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
    const isExpired = sub?.expiresAt && sub.expiresAt < new Date();
    const isPaid = sub && !isExpired && (sub.tier === "WHALE_TRACKER" || sub.tier === "ALL_ACCESS");
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

        const tag = req.body.tag ?? null;
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

        // Atomic count + upsert in a transaction to prevent race conditions.
        // SQLite Serializable isolation ensures the count won't change between
        // the check and the insert, even under concurrent requests.
        const txResult = await prisma.$transaction(async (tx) => {
            const existingCount = await tx.watchedWallet.count({
                where: { userId: user.id, active: true },
            });

            if (existingCount >= limit) {
                return { limitExceeded: true as const, count: existingCount };
            }

            const watched = await tx.watchedWallet.upsert({
                where: {
                    userId_walletAddress: { userId: user.id, walletAddress },
                },
                update: { active: true, label: label ?? undefined },
                create: {
                    userId: user.id,
                    walletAddress,
                    label: label ?? null,
                    tag,
                    chain,
                },
            });

            return { limitExceeded: false as const, watched };
        });

        if (txResult.limitExceeded) {
            const isAdmin = limit === WALLET_LIMITS.admin;
            const limitDisplay = isAdmin ? "unlimited" : String(limit);
            res.status(403).json({
                error: limit === WALLET_LIMITS.free
                    ? `Free tier: max ${WALLET_LIMITS.free} watched wallets. Upgrade to Whale Tracker for ${WALLET_LIMITS.paid}!`
                    : `Limit reached: ${limitDisplay} wallets for your tier`,
                currentCount: txResult.count,
                limit: limit === Infinity ? null : limit,
            });
            return;
        }

        const watched = txResult.watched!;

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
                tag: watched.tag,
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
                tag: w.tag,
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
 * PATCH /api/tracker/update
 * Update label and/or tag for a watched wallet.
 * Auth: Telegram initData via telegramAuthMiddleware.
 *
 * Body: { walletAddress, label?, tag? }
 */
trackerRouter.patch("/tracker/update", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        let { walletAddress, label, tag } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: "Missing walletAddress" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // Lowercase EVM addresses for consistent matching
        if (/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            walletAddress = walletAddress.toLowerCase();
        }

        const existing = await prisma.watchedWallet.findFirst({
            where: { userId: user.id, walletAddress, active: true },
        });

        if (!existing) {
            res.status(404).json({ error: "Wallet not found in your watchlist" });
            return;
        }

        // Build update data — only update fields that were provided
        const updateData: { label?: string | null; tag?: string | null } = {};
        if (label !== undefined) updateData.label = label || null;
        if (tag !== undefined) updateData.tag = tag || null;

        const updated = await prisma.watchedWallet.update({
            where: { id: existing.id },
            data: updateData,
        });

        res.json({
            success: true,
            wallet: {
                id: updated.id,
                walletAddress: updated.walletAddress,
                label: updated.label,
                tag: updated.tag,
                chain: updated.chain,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Update wallet error:", message);
        res.status(500).json({ error: "Failed to update wallet" });
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

            const [lamports, tokenAccounts, token2022Accounts] = await Promise.all([
                connection.getBalance(pubkey),
                connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
                connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
            ]);

            const balanceMap = new Map<string, { amount: number; decimals: number }>();
            if (lamports > 0) {
                balanceMap.set(WSOL_MINT, { amount: lamports / 1e9, decimals: 9 });
            }

            // Process both SPL Token and Token-2022 accounts
            const allAccounts = [...tokenAccounts.value, ...token2022Accounts.value];
            for (const account of allAccounts) {
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

// ─── Chain explorer URL maps (for activity response) ─────────────────────────
const EXPLORER_TX: Record<string, string> = {
    solana:   "https://solscan.io/tx/",
    ethereum: "https://etherscan.io/tx/",
    bsc:      "https://bscscan.com/tx/",
    polygon:  "https://polygonscan.com/tx/",
    arbitrum: "https://arbiscan.io/tx/",
    base:     "https://basescan.org/tx/",
};

const MORALIS_CHAIN_MAP: Record<string, string> = {
    ethereum: "eth",
    bsc: "bsc",
    polygon: "polygon",
    arbitrum: "arbitrum",
    base: "base",
};

interface ActivityItem {
    signature: string;
    type: "send" | "receive" | "unknown";
    amount: number | null;
    symbol: string | null;
    counterparty: string | null;
    timestamp: number; // unix seconds
    explorerUrl: string;
}

/**
 * GET /api/tracker/activity/:walletAddress
 * Fetches last 10 transactions for a watched wallet (live, no DB).
 */
trackerRouter.get("/tracker/activity/:walletAddress", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        let walletAddress = req.params.walletAddress as string;

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            walletAddress = walletAddress.toLowerCase();
        }

        const watchedWallet = await prisma.watchedWallet.findFirst({
            where: { userId: user.id, walletAddress, active: true },
        });

        if (!watchedWallet) {
            res.status(403).json({ error: "You are not watching this wallet." });
            return;
        }

        const chain = watchedWallet.chain;
        console.log(`Activity request: wallet=${walletAddress.slice(0, 10)}..., chain=${chain}`);
        let transactions: ActivityItem[] = [];

        // 30s overall timeout to prevent hanging requests
        const activityPromise = chain === "solana"
            ? fetchSolanaActivity(walletAddress)
            : fetchEvmActivity(walletAddress, chain);

        try {
            transactions = await Promise.race([
                activityPromise,
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Activity fetch timed out")), 30000)),
            ]);
        } catch (timeoutErr) {
            console.warn(`Activity fetch timeout for ${walletAddress} (${chain})`);
            transactions = [];
        }

        res.json({ walletAddress, chain, transactions });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Fetch activity error:", message);
        res.status(500).json({ error: "Failed to fetch activity" });
    }
});

/**
 * Fetch last 10 Solana transactions with parsed transfer info.
 */
async function fetchSolanaActivity(walletAddress: string): Promise<ActivityItem[]> {
    const pubkey = new PublicKey(walletAddress);
    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 10 });

    if (signatures.length === 0) return [];

    // Fetch all transactions in parallel with a 15s timeout per call
    const txResults = await Promise.allSettled(
        signatures.map(sig =>
            Promise.race([
                connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 }),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
            ])
        )
    );

    const activities: ActivityItem[] = [];

    for (let i = 0; i < signatures.length; i++) {
        const sig = signatures[i];
        const item: ActivityItem = {
            signature: sig.signature,
            type: "unknown",
            amount: null,
            symbol: null,
            counterparty: null,
            timestamp: sig.blockTime ?? 0,
            explorerUrl: EXPLORER_TX.solana + sig.signature,
        };

        const result = txResults[i];
        if (result.status === "fulfilled" && result.value?.meta) {
            const tx = result.value;
            const accountKeys = tx.transaction.message.accountKeys;
            const walletIndex = accountKeys.findIndex(k => k.pubkey.toBase58() === walletAddress);

            if (walletIndex >= 0) {
                const pre = tx.meta!.preBalances[walletIndex];
                const post = tx.meta!.postBalances[walletIndex];
                const changeLamports = post - pre;
                const changeSOL = Math.abs(changeLamports) / 1e9;

                if (changeSOL > 0.001) {
                    item.type = changeLamports > 0 ? "receive" : "send";
                    item.amount = changeSOL;
                    item.symbol = "SOL";

                    // Find counterparty (largest opposite change)
                    let bestIdx = -1;
                    let bestChange = 0;
                    for (let i = 0; i < accountKeys.length; i++) {
                        if (i === walletIndex) continue;
                        const otherChange = tx.meta!.postBalances[i] - tx.meta!.preBalances[i];
                        if (Math.sign(otherChange) !== Math.sign(changeLamports) && Math.abs(otherChange) > bestChange) {
                            bestChange = Math.abs(otherChange);
                            bestIdx = i;
                        }
                    }
                    if (bestIdx >= 0) {
                        item.counterparty = accountKeys[bestIdx].pubkey.toBase58();
                    }
                }
            }
        }

        activities.push(item);
    }

    return activities;
}

/**
 * Fetch last 10 EVM transactions via Moralis API.
 */
async function fetchEvmActivity(walletAddress: string, chain: string): Promise<ActivityItem[]> {
    const apiKey = config.MORALIS_API_KEY;
    if (!apiKey) {
        console.warn("fetchEvmActivity: MORALIS_API_KEY not set");
        return [];
    }

    const moralisChain = MORALIS_CHAIN_MAP[chain] ?? "eth";
    const explorerBase = EXPLORER_TX[chain] ?? EXPLORER_TX.ethereum;

    try {
        const url = `https://deep-index.moralis.io/api/v2.2/${walletAddress}?chain=${moralisChain}&limit=10`;
        console.log(`fetchEvmActivity: GET ${url.replace(walletAddress, walletAddress.slice(0, 10) + "...")}`);

        const resp = await fetch(url, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });

        if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            console.error(`fetchEvmActivity: Moralis ${resp.status} — ${body.slice(0, 200)}`);
            return [];
        }

        const data = await resp.json() as { result?: any[] };
        const txs = data.result ?? [];
        console.log(`fetchEvmActivity: got ${txs.length} transactions for ${chain}`);

        return txs.map((tx: any) => {
            const isReceive = tx.to_address?.toLowerCase() === walletAddress.toLowerCase();
            const valueWei = BigInt(tx.value ?? "0");
            const amount = Number(valueWei) / 1e18;

            return {
                signature: tx.hash ?? "",
                type: amount > 0 ? (isReceive ? "receive" : "send") : "unknown",
                amount: amount > 0 ? amount : null,
                symbol: null,
                counterparty: isReceive ? tx.from_address : tx.to_address,
                timestamp: tx.block_timestamp ? Math.floor(new Date(tx.block_timestamp).getTime() / 1000) : 0,
                explorerUrl: explorerBase + (tx.hash ?? ""),
            } satisfies ActivityItem;
        });
    } catch (err) {
        console.error("fetchEvmActivity error:", err instanceof Error ? err.message : err);
        return [];
    }
}
