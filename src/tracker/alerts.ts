import { config } from "../config";

/**
 * Alert formatting and delivery for whale tracker notifications.
 * Sends messages directly via Telegram Bot API.
 */

export interface AlertData {
    walletAddress: string;
    label: string | null;
    direction: "sent" | "received";
    amount: number;          // Token or SOL amount
    symbol?: string;         // Token symbol (e.g. USDC, SOL)
    signature: string;       // Transaction signature
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

    const solscanUrl = `https://solscan.io/tx/${data.signature}`;

    return [
        `${emoji} *Whale Alert*`,
        ``,
        `*${walletLabel}* ${verb.toLowerCase()} *${amountStr} ${symbol}*`,
        ``,
        `💼 Wallet: \`${shortenAddress(data.walletAddress)}\``,
        `🔗 [View TX on Solscan](${solscanUrl})`,
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
