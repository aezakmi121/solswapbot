import { Router, Request, Response } from "express";
import { findUserByTelegramId, updateUserWallet, updateUserEvmWallet, getUserWithReferralCount, deleteUserAndData } from "../../db/queries/users";
import { connection } from "../../solana/connection";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { isValidSolanaAddress } from "../../utils/validation";
import { getTokenPricesBatch } from "../../jupiter/price";
import { getTokensMetadata } from "../../jupiter/tokens";
import { addAddressToWebhook } from "../../helius/client";
import { getEvmPortfolio } from "../../moralis/client";

export const userRouter = Router();

/**
 * GET /api/user
 * Returns the user's wallet address and SOL balance.
 * telegramId is extracted from verified initData by auth middleware (C2/C5).
 */
userRouter.get("/user", async (_req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;

        const user = await getUserWithReferralCount(telegramId);

        if (!user) {
            res.status(404).json({ error: "User not found. Start the bot with /start first." });
            return;
        }

        const referralCount = user._count.referrals;

        if (!user.walletAddress) {
            res.json({
                telegramId: user.telegramId,
                walletAddress: null,
                solBalance: null,
                referralCode: user.referralCode,
                referralCount,
                message: "No wallet connected. Open the Mini App to set up your wallet.",
            });
            return;
        }

        // Fetch SOL balance
        let solBalance: number | null = null;
        try {
            const pubkey = new PublicKey(user.walletAddress);
            const lamports = await connection.getBalance(pubkey);
            solBalance = lamports / 1e9;
        } catch {
            // Balance fetch failed, return null
        }

        res.json({
            telegramId: user.telegramId,
            walletAddress: user.walletAddress,
            evmWalletAddress: user.evmWalletAddress ?? null,
            solBalance,
            referralCode: user.referralCode,
            referralCount,
        });
    } catch (err) {
        console.error("User API error:", err);
        res.status(500).json({ error: "Failed to fetch user data" });
    }
});

/**
 * POST /api/user/wallet
 * Saves a Privy-managed wallet address to the user's account.
 * telegramId from verified initData — prevents wallet hijacking (C3).
 *
 * Body: { walletAddress }
 */
userRouter.post("/user/wallet", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: "Missing walletAddress" });
            return;
        }

        if (!isValidSolanaAddress(walletAddress)) {
            res.status(400).json({ error: "Invalid wallet address" });
            return;
        }

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found. Start the bot with /start first." });
            return;
        }

        // Only update if wallet is not already set or is different
        if (user.walletAddress !== walletAddress) {
            await updateUserWallet(telegramId, walletAddress);

            // Register address with Helius webhook for receive tracking (non-blocking)
            addAddressToWebhook(walletAddress).catch((err) => {
                console.error("Helius address registration failed (non-fatal):", err);
            });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Wallet save error:", err);
        res.status(500).json({ error: "Failed to save wallet address" });
    }
});

/**
 * POST /api/user/evm-wallet
 * Saves a Privy-managed EVM wallet address (Ethereum-compatible) to the user's account.
 * Mirrors POST /api/user/wallet but for EVM addresses.
 *
 * Body: { evmWalletAddress }
 */
userRouter.post("/user/evm-wallet", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const { evmWalletAddress } = req.body;

        if (!evmWalletAddress) {
            res.status(400).json({ error: "Missing evmWalletAddress" });
            return;
        }

        // Validate EVM address format (0x + 40 hex chars, case-insensitive)
        if (!/^0x[a-fA-F0-9]{40}$/.test(evmWalletAddress)) {
            res.status(400).json({ error: "Invalid EVM wallet address" });
            return;
        }

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found. Start the bot with /start first." });
            return;
        }

        if (user.evmWalletAddress !== evmWalletAddress) {
            await updateUserEvmWallet(telegramId, evmWalletAddress);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("EVM wallet save error:", err);
        res.status(500).json({ error: "Failed to save EVM wallet address" });
    }
});

/**
 * GET /api/user/balances?walletAddress=<ADDR>
 * Returns SOL balance + all SPL token balances for a wallet.
 */
userRouter.get("/user/balances", async (req: Request, res: Response) => {
    try {
        const walletAddress = req.query.walletAddress as string;

        if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
            res.status(400).json({ error: "Invalid or missing walletAddress" });
            return;
        }

        const pubkey = new PublicKey(walletAddress);

        // Fetch SOL balance and SPL token accounts in parallel
        const [lamports, tokenAccounts] = await Promise.all([
            connection.getBalance(pubkey),
            connection.getParsedTokenAccountsByOwner(pubkey, {
                programId: TOKEN_PROGRAM_ID,
            }),
        ]);

        const solBalance = lamports / 1e9;

        // Wrapped SOL mint for consistency with the token list
        const WSOL_MINT = "So11111111111111111111111111111111111111112";

        const balances: Array<{
            mint: string;
            amount: number;
            decimals: number;
        }> = [
            { mint: WSOL_MINT, amount: solBalance, decimals: 9 },
        ];

        for (const account of tokenAccounts.value) {
            const parsed = account.account.data.parsed;
            const info = parsed.info;
            const uiAmount = info.tokenAmount.uiAmount;
            if (uiAmount > 0) {
                balances.push({
                    mint: info.mint,
                    amount: uiAmount,
                    decimals: info.tokenAmount.decimals,
                });
            }
        }

        res.json({ balances });
    } catch (err) {
        console.error("Balances API error:", err);
        res.status(500).json({ error: "Failed to fetch balances" });
    }
});

/**
 * GET /api/user/portfolio
 * Returns all held tokens with USD prices in one batched call.
 * Merges Solana tokens (Jupiter) + EVM tokens (Moralis) if user has an EVM wallet.
 * Each token includes a `chain` field: "solana" | "ethereum" | "bsc" | "polygon" | "arbitrum" | "base"
 * Response: { totalValueUsd, tokens: [PortfolioToken], walletAddress, evmWalletAddress }
 */
userRouter.get("/user/portfolio", async (_req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const user = await findUserByTelegramId(telegramId);

        if (!user?.walletAddress) {
            res.json({ totalValueUsd: 0, tokens: [], walletAddress: null, evmWalletAddress: null });
            return;
        }

        const pubkey = new PublicKey(user.walletAddress);
        const WSOL_MINT = "So11111111111111111111111111111111111111112";

        // Fetch Solana + EVM portfolios in parallel
        const [solanaResult, evmTokens] = await Promise.all([
            // Solana: SOL balance + SPL tokens
            (async () => {
                const [lamports, tokenAccounts] = await Promise.all([
                    connection.getBalance(pubkey),
                    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
                ]);

                const balanceMap = new Map<string, { amount: number; decimals: number }>();
                balanceMap.set(WSOL_MINT, { amount: lamports / 1e9, decimals: 9 });

                for (const account of tokenAccounts.value) {
                    const info = account.account.data.parsed.info;
                    const uiAmount = info.tokenAmount.uiAmount;
                    if (uiAmount > 0) {
                        balanceMap.set(info.mint, {
                            amount: uiAmount,
                            decimals: info.tokenAmount.decimals,
                        });
                    }
                }
                return balanceMap;
            })(),

            // EVM: fetch from Moralis if user has an EVM wallet (non-blocking — returns [] if no key)
            user.evmWalletAddress ? getEvmPortfolio(user.evmWalletAddress) : Promise.resolve([]),
        ]);

        const mints = [...solanaResult.keys()];

        // Batch fetch prices + token metadata for Solana tokens
        const [prices, metadata] = await Promise.all([
            getTokenPricesBatch(mints),
            getTokensMetadata(mints),
        ]);

        // Build Solana token list (with chain: "solana")
        const solTokens = mints.map((mint) => {
            const bal = solanaResult.get(mint)!;
            const priceUsd = prices[mint] ?? null;
            const info = metadata[mint];
            const valueUsd = priceUsd !== null ? bal.amount * priceUsd : null;
            return {
                chain: "solana",
                mint,
                symbol: info?.symbol ?? mint.slice(0, 6),
                name: info?.name ?? "Unknown Token",
                icon: info?.logoURI ?? null,
                amount: bal.amount,
                decimals: bal.decimals,
                priceUsd,
                valueUsd,
            };
        });

        // Convert EVM tokens to same shape (mint = token address, chain = chain name)
        const evmTokensFormatted = evmTokens.map((t) => ({
            chain: t.chain,
            mint: t.address,    // token contract address or "native"
            symbol: t.symbol,
            name: t.name,
            icon: t.icon,
            amount: t.amount,
            decimals: t.decimals,
            priceUsd: t.priceUsd,
            valueUsd: t.valueUsd,
        }));

        // Merge all tokens, sort by USD value desc
        const tokens = [...solTokens, ...evmTokensFormatted];
        tokens.sort((a, b) => {
            if (a.valueUsd !== null && b.valueUsd !== null) return b.valueUsd - a.valueUsd;
            if (a.valueUsd !== null) return -1;
            if (b.valueUsd !== null) return 1;
            return a.symbol.localeCompare(b.symbol);
        });

        const totalValueUsd = tokens.reduce(
            (sum, t) => (t.valueUsd !== null ? sum + t.valueUsd : sum),
            0
        );

        res.json({
            totalValueUsd,
            tokens,
            walletAddress: user.walletAddress,
            evmWalletAddress: user.evmWalletAddress ?? null,
        });
    } catch (err) {
        console.error("Portfolio API error:", err);
        res.status(500).json({ error: "Failed to fetch portfolio" });
    }
});

/**
 * DELETE /api/user
 * H3: GDPR Right to Erasure — deletes the user and all associated data.
 * Cascade-deletes: Swaps, Transfers, TokenScans, WatchedWallets, Subscription.
 * Unlinks (but does not delete) any users referred by this user.
 */
userRouter.delete("/user", async (_req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;

        const deleted = await deleteUserAndData(telegramId);
        if (!deleted) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.json({ success: true, message: "Account and all associated data deleted" });
    } catch (err) {
        console.error("User deletion error:", err);
        res.status(500).json({ error: "Failed to delete user data" });
    }
});
