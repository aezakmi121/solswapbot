import { Router, Request, Response } from "express";
import { config } from "../../config";
import { prisma } from "../../db/client";
import { parseHeliusEvent, IncomingTransfer } from "../../helius/parser";
import { getTokenByMint } from "../../jupiter/tokens";
import { formatAlert, sendTelegramAlert } from "../../tracker/alerts";

export const webhookRouter = Router();

/**
 * POST /api/webhook/helius
 *
 * Receives enhanced transaction events from the Helius webhook.
 * Auth: Helius sends our HELIUS_WEBHOOK_SECRET as the Authorization header.
 * This route is PUBLIC (no Telegram auth) — webhook auth only.
 *
 * Body: Array of Helius enhanced transaction objects.
 *
 * For each incoming transfer to a watched wallet:
 *   1. Look up the user by walletAddress
 *   2. Dedup by txSignature (skip if already recorded)
 *   3. Save as Transfer with direction="RECEIVE"
 */
webhookRouter.post("/webhook/helius", async (req: Request, res: Response) => {
    try {
        // Verify webhook auth
        const authHeader = req.headers.authorization;
        if (!config.HELIUS_WEBHOOK_SECRET || authHeader !== config.HELIUS_WEBHOOK_SECRET) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const events = req.body;
        if (!Array.isArray(events)) {
            res.status(400).json({ error: "Expected array of events" });
            return;
        }

        // Build set of all watched wallet addresses for fast lookup
        const users = await prisma.user.findMany({
            where: { walletAddress: { not: null } },
            select: { id: true, walletAddress: true },
        });
        const addressToUserId = new Map<string, string>();
        const watchedAddresses = new Set<string>();
        for (const u of users) {
            if (u.walletAddress) {
                addressToUserId.set(u.walletAddress, u.id);
                watchedAddresses.add(u.walletAddress);
            }
        }

        let saved = 0;

        for (const event of events) {
            const transfers = parseHeliusEvent(event, watchedAddresses);

            for (const t of transfers) {
                const userId = addressToUserId.get(t.recipientAddress);
                if (!userId) continue;

                // Dedup: skip if this tx signature + direction already exists for this user
                const existing = await prisma.transfer.findFirst({
                    where: {
                        txSignature: t.txSignature,
                        userId,
                        direction: "RECEIVE",
                        tokenMint: t.tokenMint,
                    },
                });
                if (existing) continue;

                // Also skip if this txSignature is from one of the user's own swaps
                const isSwapTx = await prisma.swap.findFirst({
                    where: { txSignature: t.txSignature, userId },
                });
                if (isSwapTx) continue;

                // Resolve token symbol from Jupiter cache
                let tokenSymbol: string | null = null;
                try {
                    const meta = await getTokenByMint(t.tokenMint);
                    tokenSymbol = meta?.symbol ?? null;
                } catch {
                    // Non-fatal
                }

                await prisma.transfer.create({
                    data: {
                        userId,
                        tokenMint: t.tokenMint,
                        tokenSymbol,
                        humanAmount: t.humanAmount,
                        recipientAddress: t.recipientAddress,
                        senderAddress: t.senderAddress,
                        direction: "RECEIVE",
                        txSignature: t.txSignature,
                        status: "CONFIRMED",
                    },
                });

                saved++;
            }

            // ─── NEW: Whale Tracker Alerts ───
            const nativeTransfers = event.nativeTransfers as Array<{
                fromUserAccount: string;
                toUserAccount: string;
                amount: number; // in lamports
            }> ?? [];

            for (const nt of nativeTransfers) {
                const solAmount = nt.amount / 1e9;
                if (solAmount < Number(config.MIN_SOL_ALERT || 10)) continue;

                const addresses = [nt.fromUserAccount, nt.toUserAccount];
                for (const address of addresses) {
                    const watchedWallet = await prisma.watchedWallet.findFirst({
                        where: { walletAddress: address, chain: "solana", active: true },
                        include: { user: true }
                    });

                    if (watchedWallet) {
                        const direction = address === nt.toUserAccount ? "received" : "sent";
                        const alert = formatAlert({
                            walletAddress: watchedWallet.walletAddress,
                            label: watchedWallet.label,
                            direction,
                            amount: solAmount,
                            symbol: "SOL",
                            signature: event.signature,
                        });
                        // Non-blocking fire-and-forget
                        sendTelegramAlert(watchedWallet.user.telegramId, alert).catch((e: Error) =>
                            console.error("Helius whale alert send error:", e)
                        );
                    }
                }
            }

            // Whale Tracker for SPL tokens
            const minUsdValue = Number(config.MIN_SOL_ALERT || 10) * 150; // Approximating 1 SOL = $150
            const tokenTransfers = event.tokenTransfers as Array<{
                fromUserAccount: string;
                toUserAccount: string;
                tokenAmount: number;
                mint: string;
            }> ?? [];

            if (tokenTransfers.length > 0) {
                try {
                    const { getTokenPricesBatch } = await import("../../jupiter/price");
                    const mintsToPrice = Array.from(new Set(tokenTransfers.map(t => t.mint)));
                    const prices = await getTokenPricesBatch(mintsToPrice);

                    for (const tt of tokenTransfers) {
                        const price = prices[tt.mint]?.priceUsd || 0;
                        const usdValue = tt.tokenAmount * price;
                        if (usdValue < minUsdValue) continue;

                        const addresses = [tt.fromUserAccount, tt.toUserAccount];
                        for (const address of addresses) {
                            const watchedWallet = await prisma.watchedWallet.findFirst({
                                where: { walletAddress: address, chain: "solana", active: true },
                                include: { user: true }
                            });

                            if (watchedWallet) {
                                const direction = address === tt.toUserAccount ? "received" : "sent";
                                const meta = await getTokenByMint(tt.mint);
                                const symbol = meta?.symbol || "SPL Token";

                                const alert = formatAlert({
                                    walletAddress: watchedWallet.walletAddress,
                                    label: watchedWallet.label,
                                    direction,
                                    amount: tt.tokenAmount,
                                    symbol: symbol,
                                    signature: event.signature,
                                });
                                sendTelegramAlert(watchedWallet.user.telegramId, alert).catch((e: Error) =>
                                    console.error("Helius SPL whale alert send error:", e)
                                );
                            }
                        }
                    }
                } catch (e) {
                    console.error("SPL whale alert processing error:", e);
                }
            }
        }

        if (saved > 0) {
            console.log(`Helius webhook: saved ${saved} incoming transfer(s)`);
        }

        // Always return 200 so Helius doesn't retry
        res.json({ received: events.length, saved });
    } catch (err) {
        console.error("Helius webhook error:", err);
        // Return 200 even on error to prevent Helius retry storms
        res.status(200).json({ error: "Processing failed", received: 0, saved: 0 });
    }
});
