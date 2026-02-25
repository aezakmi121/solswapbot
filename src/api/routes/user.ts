import { Router, Request, Response } from "express";
import { findUserByTelegramId, updateUserWallet } from "../../db/queries/users";
import { connection } from "../../solana/connection";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { isValidSolanaAddress } from "../../utils/validation";

export const userRouter = Router();

/**
 * GET /api/user?telegramId=<ID>
 * Returns the user's wallet address and SOL balance.
 * Used by the Mini App to identify the user and show their wallet.
 */
userRouter.get("/user", async (req: Request, res: Response) => {
    try {
        const telegramId = req.query.telegramId as string;

        if (!telegramId) {
            res.status(400).json({ error: "Missing telegramId" });
            return;
        }

        const user = await findUserByTelegramId(telegramId);

        if (!user) {
            res.status(404).json({ error: "User not found. Start the bot with /start first." });
            return;
        }

        if (!user.walletAddress) {
            res.json({
                telegramId: user.telegramId,
                walletAddress: null,
                solBalance: null,
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
        });
    } catch (err) {
        console.error("User API error:", err);
        res.status(500).json({ error: "Failed to fetch user data" });
    }
});

/**
 * POST /api/user/wallet
 * Saves a Privy-managed wallet address to the user's account.
 * Called automatically when the Mini App detects a new embedded wallet.
 *
 * Body: { telegramId, walletAddress }
 */
userRouter.post("/user/wallet", async (req: Request, res: Response) => {
    try {
        const { telegramId, walletAddress } = req.body;

        if (!telegramId || !walletAddress) {
            res.status(400).json({ error: "Missing telegramId or walletAddress" });
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
