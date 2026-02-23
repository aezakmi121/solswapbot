import { Router, Request, Response } from "express";
import { findUserByTelegramId } from "../../db/queries/users";
import { connection } from "../../solana/connection";
import { PublicKey } from "@solana/web3.js";

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
                message: "No wallet connected. Use /connect <ADDRESS> in the bot first.",
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
