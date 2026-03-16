import { connection } from "../solana/connection";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "../db/client";
import { formatAlert, sendTelegramAlert } from "./alerts";
import { getTokenPricesBatch } from "../jupiter/price";
import { getTokensMetadata } from "../jupiter/tokens";

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
const MIN_SOL_ALERT = 10;        // Alert on native SOL transfers >= 10 SOL
const MIN_USD_ALERT = 150;       // Alert on SPL token transfers >= $150 USD
const MAX_ALERT_AGE_S = 300;     // Ignore transactions older than 5 minutes (prevents false alerts on restart)

// Track last seen signature + timestamp per wallet to avoid duplicate/stale alerts
interface WalletBaseline {
    signature: string;
    timestamp: number;  // Date.now() when baseline was set
}
const lastSeenData = new Map<string, WalletBaseline>();

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
        // Only poll Solana wallets — EVM wallets are monitored via Moralis webhooks
        const watchedWallets = await prisma.watchedWallet.findMany({
            where: { active: true, chain: "solana" },
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
        const lastSeen = lastSeenData.get(wallet.walletAddress);

        const signatures = await connection.getSignaturesForAddress(pubkey, {
            limit: 5,
            until: lastSeen?.signature,
        });

        if (signatures.length === 0) return;

        // Update baseline to the most recent signature
        lastSeenData.set(wallet.walletAddress, {
            signature: signatures[0].signature,
            timestamp: Date.now(),
        });

        // On first poll for this wallet, just set the baseline — don't alert
        if (!lastSeen) return;

        // Check each new transaction, skipping old ones to prevent false alerts after restart
        const nowS = Math.floor(Date.now() / 1000);
        for (const sig of signatures) {
            // Skip transactions older than MAX_ALERT_AGE_S (5 min)
            if (sig.blockTime && (nowS - sig.blockTime) > MAX_ALERT_AGE_S) {
                continue;
            }
            await checkTransaction(wallet, sig.signature);
        }
    } catch (err) {
        console.warn(`Whale tracker: failed to process ${wallet.walletAddress}:`,
            err instanceof Error ? err.message : err);
    }
}

/**
 * Check if a transaction is significant enough to trigger an alert.
 * Handles both native SOL transfers and SPL token transfers with correct decimals.
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

        let alerted = false;

        // ── 1. Check native SOL balance changes ──
        const preBalances = tx.meta.preBalances;
        const postBalances = tx.meta.postBalances;

        if (preBalances.length && postBalances.length) {
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
                        symbol: "SOL",
                        signature,
                    });
                    await sendTelegramAlert(wallet.user.telegramId, alert);
                    alerted = true;
                    break;
                }
            }
        }

        // ── 2. Check SPL token balance changes via postTokenBalances ──
        // Uses the transaction metadata which includes mint, decimals, and uiAmount
        // for each token account — no extra RPC calls needed for amount conversion.
        if (!alerted && tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
            const pre = tx.meta.preTokenBalances;
            const post = tx.meta.postTokenBalances;

            // Collect significant token changes for this wallet
            const changes: Array<{ mint: string; uiChange: number; direction: "sent" | "received" }> = [];

            for (const postBal of post) {
                if (postBal.owner !== wallet.walletAddress) continue;

                const postUiAmount = postBal.uiTokenAmount?.uiAmount ?? 0;
                const preBal = pre.find(p => p.accountIndex === postBal.accountIndex);
                const preUiAmount = preBal?.uiTokenAmount?.uiAmount ?? 0;
                const change = Math.abs(postUiAmount - preUiAmount);

                if (change > 0) {
                    changes.push({
                        mint: postBal.mint,
                        uiChange: change,
                        direction: postUiAmount > preUiAmount ? "received" : "sent",
                    });
                }
            }

            if (changes.length === 0) return;

            // Batch lookup USD prices for all changed tokens
            const mints = changes.map(c => c.mint);
            const [prices, metadata] = await Promise.all([
                getTokenPricesBatch(mints),
                getTokensMetadata(mints),
            ]);

            for (const change of changes) {
                const priceUsd = prices[change.mint]?.priceUsd ?? 0;
                const valueUsd = change.uiChange * priceUsd;

                if (valueUsd >= MIN_USD_ALERT) {
                    const tokenMeta = metadata[change.mint];
                    const symbol = tokenMeta?.symbol ?? change.mint.slice(0, 6);
                    const alert = formatAlert({
                        walletAddress: wallet.walletAddress,
                        label: wallet.label,
                        direction: change.direction,
                        amount: change.uiChange,
                        symbol,
                        signature,
                    });
                    await sendTelegramAlert(wallet.user.telegramId, alert);
                    break; // One alert per transaction
                }
            }
        }
    } catch (err) {
        console.warn(`Whale tracker: failed to parse tx ${signature}:`,
            err instanceof Error ? err.message : err);
    }
}
