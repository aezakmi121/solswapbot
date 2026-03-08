import { connection } from "../solana/connection";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "../db/client";
import { formatAlert, sendTelegramAlert } from "./alerts";

/**
 * Whale Tracker — monitors watched wallets for large transactions.
 *
 * Two modes:
 *   1. Polling mode (default): periodically checks recent signatures for watched wallets
 *   2. Webhook mode (future): Helius webhooks push transaction data in real-time
 *
 * Polling runs every 30 seconds and checks the last few transactions for each active wallet.
 * When a significant transaction is detected, sends a Telegram alert to the user.
 */

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const MIN_SOL_ALERT = 10;        // Alert on transfers >= 10 SOL

// Track last seen signature per wallet to avoid duplicate alerts
const lastSeenSignatures = new Map<string, string>();

/**
 * Start polling all active watched wallets.
 * Called once when the bot starts.
 */
export function startWalletMonitor(): void {
    console.log("Whale tracker started (polling mode)");
    setInterval(pollWatchedWallets, POLL_INTERVAL_MS);
}

/**
 * Poll all active watched wallets for new transactions.
 */
async function pollWatchedWallets(): Promise<void> {
    try {
        const watchedWallets = await prisma.watchedWallet.findMany({
            where: { active: true },
            include: { user: true },
        });

        if (watchedWallets.length === 0) return;

        // Process wallets in small batches to avoid RPC rate limits
        const batchSize = 5;
        for (let i = 0; i < watchedWallets.length; i += batchSize) {
            const batch = watchedWallets.slice(i, i + batchSize);
            await Promise.all(batch.map(processWallet));

            // Small delay between batches
            if (i + batchSize < watchedWallets.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } catch (err) {
        console.error("Whale tracker poll error:", err instanceof Error ? err.message : err);
    }
}

/**
 * Check a single wallet for new transactions since last poll.
 */
async function processWallet(wallet: {
    id: string;
    walletAddress: string;
    label: string | null;
    user: { telegramId: string };
}): Promise<void> {
    try {
        const pubkey = new PublicKey(wallet.walletAddress);
        const lastSeen = lastSeenSignatures.get(wallet.walletAddress);

        const signatures = await connection.getSignaturesForAddress(pubkey, {
            limit: 5,
            until: lastSeen,
        });

        if (signatures.length === 0) return;

        // Update last seen to the most recent signature
        lastSeenSignatures.set(wallet.walletAddress, signatures[0].signature);

        // On first poll for this wallet, just set the baseline — don't alert
        if (!lastSeen) return;

        // Check each new transaction
        for (const sig of signatures) {
            await checkTransaction(wallet, sig.signature);
        }
    } catch (err) {
        // Silently skip — wallet might be invalid or RPC might be rate limited
    }
}

/**
 * Check if a transaction is significant enough to trigger an alert.
 */
async function checkTransaction(
    wallet: {
        walletAddress: string;
        label: string | null;
        user: { telegramId: string };
    },
    signature: string,
): Promise<void> {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) return;

        // Calculate SOL transfer amount from balance changes
        const preBalances = tx.meta.preBalances;
        const postBalances = tx.meta.postBalances;

        if (!preBalances.length || !postBalances.length) return;

        // Check all accounts in the transaction for significant balance changes
        const accountKeys = tx.transaction.message.accountKeys;
        for (let i = 0; i < accountKeys.length; i++) {
            const address = accountKeys[i].pubkey.toBase58();
            if (address !== wallet.walletAddress) continue;

            const balanceChange = Math.abs(postBalances[i] - preBalances[i]) / 1e9; // lamports → SOL

            if (balanceChange >= MIN_SOL_ALERT) {
                const direction = postBalances[i] > preBalances[i] ? "received" : "sent";
                const alert = formatAlert({
                    walletAddress: wallet.walletAddress,
                    label: wallet.label,
                    direction,
                    amount: balanceChange,
                    signature,
                });
                await sendTelegramAlert(wallet.user.telegramId, alert);
                break;
            }
        }

        // Also check for token transfers via parsed instructions
        if (tx.meta.innerInstructions) {
            for (const inner of tx.meta.innerInstructions) {
                for (const ix of inner.instructions) {
                    if ("parsed" in ix && ix.parsed?.type === "transfer") {
                        const info = ix.parsed.info;
                        if (info && (info.source === wallet.walletAddress || info.destination === wallet.walletAddress)) {
                            const amount = Number(info.lamports ?? info.amount ?? 0) / 1e9;
                            if (amount >= MIN_SOL_ALERT) {
                                const direction = info.destination === wallet.walletAddress ? "received" : "sent";
                                const alert = formatAlert({
                                    walletAddress: wallet.walletAddress,
                                    label: wallet.label,
                                    direction,
                                    amount,
                                    signature,
                                });
                                await sendTelegramAlert(wallet.user.telegramId, alert);
                            }
                        }
                    }
                }
            }
        }
    } catch {
        // Skip failed transaction parsing
    }
}
