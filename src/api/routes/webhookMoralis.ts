import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../../db/client";
import { config } from "../../config";
import { formatAlert, sendTelegramAlert } from "../../tracker/alerts";

export const webhookMoralisRouter = Router();

/**
 * POST /api/webhook/moralis
 *
 * Receives real-time EVM transaction events from Moralis Streams.
 * Triggered when a watched EVM wallet sends or receives native tokens.
 *
 * Auth: Moralis signs the body with MORALIS_WEBHOOK_SECRET.
 * We verify using HMAC-SHA256 of the raw body.
 *
 * Docs: https://docs.moralis.io/streams-api/evm/webhooks/response-body
 */
webhookMoralisRouter.post("/webhook/moralis", async (req: Request, res: Response) => {
    // ── Auth: verify Moralis signature ──
    const signature = req.headers["x-signature"] as string | undefined;

    if (!config.MORALIS_WEBHOOK_SECRET) {
        res.status(503).json({ error: "Moralis Streams not configured" });
        return;
    }

    if (!signature) {
        res.status(401).json({ error: "Missing x-signature header" });
        return;
    }

    // Moralis HMAC: SHA3-256 of (body + secret), provided as the x-signature header
    const bodyStr = JSON.stringify(req.body);
    const expected = crypto
        .createHash("sha3-256")
        .update(bodyStr + config.MORALIS_WEBHOOK_SECRET)
        .digest("hex");

    if (signature !== expected) {
        res.status(401).json({ error: "Invalid Moralis webhook signature" });
        return;
    }

    // Always respond 200 immediately — Moralis retries on failure
    res.status(200).json({ ok: true });

    // ── Process async (non-blocking) ──
    processEvmWebhookEvent(req.body).catch((err) => {
        console.error("Moralis webhook processing error:", err instanceof Error ? err.message : err);
    });
});

interface MoralisNativeTx {
    hash: string;
    fromAddress: string;
    toAddress: string;
    value: string; // value in wei (as string)
    gas: string;
    chainId: string;
}

interface MoralisWebhookBody {
    chainId: string;
    confirmed: boolean;
    nativeTxs?: MoralisNativeTx[];
}

/** Chain ID → human-readable chain name and native token */
const CHAIN_INFO: Record<string, { name: string; symbol: string; decimals: number }> = {
    "0x1":    { name: "Ethereum",  symbol: "ETH",  decimals: 18 },
    "0x38":   { name: "BNB Chain", symbol: "BNB",  decimals: 18 },
    "0x89":   { name: "Polygon",   symbol: "MATIC", decimals: 18 },
    "0xa4b1": { name: "Arbitrum",  symbol: "ETH",  decimals: 18 },
    "0x2105": { name: "Base",      symbol: "ETH",  decimals: 18 },
};

async function processEvmWebhookEvent(body: MoralisWebhookBody): Promise<void> {
    // Only process confirmed transactions (not pending mempool events)
    if (!body.confirmed) return;

    const nativeTxs = body.nativeTxs ?? [];
    if (nativeTxs.length === 0) return;

    const chainInfo = CHAIN_INFO[body.chainId];
    const minThreshold = config.MIN_ETH_ALERT;

    for (const tx of nativeTxs) {
        // Convert from wei to native token amount
        const amount = Number(BigInt(tx.value)) / 1e18;
        if (amount < minThreshold) continue;

        // Check both sender and receiver against WatchedWallet
        const addresses = [tx.fromAddress.toLowerCase(), tx.toAddress.toLowerCase()];

        for (const address of addresses) {
            const watchedWallet = await prisma.watchedWallet.findFirst({
                where: {
                    walletAddress: address, // Lowercased before saving and here
                    chain: { not: "solana" },
                    active: true,
                },
                include: { user: true },
            });

            if (!watchedWallet) continue;

            const direction = address === tx.toAddress.toLowerCase() ? "received" : "sent";
            const chainLabel = chainInfo ? ` on ${chainInfo.name}` : "";
            const symbol = chainInfo?.symbol ?? "ETH";

            const alertText = formatEvmAlert({
                walletAddress: watchedWallet.walletAddress,
                label: watchedWallet.label,
                direction,
                amount,
                symbol,
                chainLabel,
                txHash: tx.hash,
                chainId: body.chainId,
            });

            await sendTelegramAlert(watchedWallet.user.telegramId, alertText);
        }
    }
}

interface EvmAlertData {
    walletAddress: string;
    label: string | null;
    direction: "sent" | "received";
    amount: number;
    symbol: string;
    chainLabel: string;
    txHash: string;
    chainId: string;
}

function formatEvmAlert(data: EvmAlertData): string {
    const emoji = data.direction === "received" ? "🟢" : "🔴";
    const verb = data.direction === "received" ? "Received" : "Sent";
    const walletLabel = data.label ?? shortenAddress(data.walletAddress);
    const amountStr = data.amount.toFixed(4);

    // Build block explorer URL
    const explorerMap: Record<string, string> = {
        "0x1":    "https://etherscan.io/tx/",
        "0x38":   "https://bscscan.com/tx/",
        "0x89":   "https://polygonscan.com/tx/",
        "0xa4b1": "https://arbiscan.io/tx/",
        "0x2105": "https://basescan.org/tx/",
    };
    const explorerUrl = (explorerMap[data.chainId] ?? "https://etherscan.io/tx/") + data.txHash;

    return [
        `${emoji} *Whale Alert${data.chainLabel}*`,
        ``,
        `*${walletLabel}* ${verb.toLowerCase()} *${amountStr} ${data.symbol}*`,
        ``,
        `💼 Wallet: \`${shortenAddress(data.walletAddress)}\``,
        `🔗 [View TX](${explorerUrl})`,
    ].join("\n");
}

function shortenAddress(address: string): string {
    if (address.length <= 8) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
