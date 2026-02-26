import { Router, Request, Response } from "express";
import { findUserByTelegramId, updateUserWallet, getUserWithReferralCount } from "../../db/queries/users";
import { connection } from "../../solana/connection";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { isValidSolanaAddress } from "../../utils/validation";
import { getTokenPricesBatch } from "../../jupiter/price";
import { getTokensMetadata } from "../../jupiter/tokens";

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
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Wallet save error:", err);
        res.status(500).json({ error: "Failed to save wallet address" });
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
 * Avoids N+1 price fetches by using Jupiter batch price endpoint.
 * Response: { totalValueUsd, tokens: [{ mint, symbol, name, icon, amount, decimals, priceUsd, valueUsd }], walletAddress }
 */
userRouter.get("/user/portfolio", async (_req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const user = await findUserByTelegramId(telegramId);

        if (!user?.walletAddress) {
            res.json({ totalValueUsd: 0, tokens: [], walletAddress: null });
            return;
        }

        const pubkey = new PublicKey(user.walletAddress);
        const WSOL_MINT = "So11111111111111111111111111111111111111112";

        // Fetch SOL balance + SPL token accounts in parallel
        const [lamports, tokenAccounts] = await Promise.all([
            connection.getBalance(pubkey),
            connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
        ]);

        const solBalance = lamports / 1e9;

        // Build mint → { amount, decimals } map (non-zero balances only)
        const balanceMap = new Map<string, { amount: number; decimals: number }>();
        balanceMap.set(WSOL_MINT, { amount: solBalance, decimals: 9 });

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

        const mints = [...balanceMap.keys()];

        // Batch fetch prices + token metadata in parallel
        const [prices, metadata] = await Promise.all([
            getTokenPricesBatch(mints),
            getTokensMetadata(mints),
        ]);

        // Build portfolio token list
        const tokens = mints.map((mint) => {
            const bal = balanceMap.get(mint)!;
            const priceUsd = prices[mint] ?? null;
            const info = metadata[mint];
            const valueUsd = priceUsd !== null ? bal.amount * priceUsd : null;
            return {
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

        // Sort by USD value desc, unknowns at end sorted alphabetically
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

        res.json({ totalValueUsd, tokens, walletAddress: user.walletAddress });
    } catch (err) {
        console.error("Portfolio API error:", err);
        res.status(500).json({ error: "Failed to fetch portfolio" });
    }
});
