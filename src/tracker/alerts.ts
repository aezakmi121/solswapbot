import { config } from "../config";

/**
 * Alert formatting and delivery for whale tracker notifications.
 * Sends messages directly via Telegram Bot API.
 */

/** Block explorer URLs by chain */
const EXPLORER_TX_URL: Record<string, string> = {
    solana:   "https://solscan.io/tx/",
    ethereum: "https://etherscan.io/tx/",
    bsc:      "https://bscscan.com/tx/",
    polygon:  "https://polygonscan.com/tx/",
    arbitrum: "https://arbiscan.io/tx/",
    base:     "https://basescan.org/tx/",
};

const CHAIN_NAMES: Record<string, string> = {
    solana: "Solana",
    ethereum: "Ethereum",
    bsc: "BNB Chain",
    polygon: "Polygon",
    arbitrum: "Arbitrum",
    base: "Base",
};

export interface AlertData {
    walletAddress: string;
    label: string | null;
    direction: "sent" | "received";
    amount: number;          // Token or SOL amount
    symbol?: string;         // Token symbol (e.g. USDC, SOL)
    signature: string;       // Transaction signature
    chain?: string;          // Chain ID (default: "solana")
}

/**
 * Format a whale alert into a nice Telegram message.
 */
export function formatAlert(data: AlertData): string {
    const emoji = data.direction === "received" ? "🟢" : "🔴";
    const verb = data.direction === "received" ? "Received" : "Sent";
    const walletLabel = data.label ?? shortenAddress(data.walletAddress);
    const amountStr = data.amount.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const symbol = data.symbol ?? "SOL";
    const chain = data.chain ?? "solana";

    const explorerBase = EXPLORER_TX_URL[chain] ?? EXPLORER_TX_URL.solana;
    const explorerUrl = explorerBase + data.signature;
    const explorerName = chain === "solana" ? "Solscan" : CHAIN_NAMES[chain] ?? "Explorer";
    const chainSuffix = chain !== "solana" ? ` on ${CHAIN_NAMES[chain] ?? chain}` : "";

    return [
        `${emoji} *Whale Alert${chainSuffix}*`,
        ``,
        `*${walletLabel}* ${verb.toLowerCase()} *${amountStr} ${symbol}*`,
        ``,
        `💼 Wallet: \`${shortenAddress(data.walletAddress)}\``,
        `🔗 [View TX on ${explorerName}](${explorerUrl})`,
    ].join("\n");
}

/**
 * Send a Telegram alert to a user via Bot API.
 * Uses direct HTTP call instead of grammy to avoid bot instance dependency.
 */
export async function sendTelegramAlert(telegramId: string, message: string): Promise<void> {
    try {
        const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: telegramId,
                text: message,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            console.error("Failed to send whale alert:", response.status, body);
        }
    } catch (err) {
        console.error("Whale alert send error:", err instanceof Error ? err.message : err);
    }
}

/**
 * Shorten a Solana address for display: "7xKX...3mPa"
 */
function shortenAddress(address: string): string {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
