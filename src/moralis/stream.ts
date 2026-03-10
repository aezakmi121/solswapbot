import { config } from "../config";

/**
 * Moralis Streams — real-time EVM wallet monitoring.
 *
 * Moralis Streams push webhook events to our server when watched EVM
 * addresses send or receive native tokens (ETH, BNB, MATIC, etc.).
 *
 * Docs: https://docs.moralis.io/streams-api/evm
 */

const MORALIS_API_BASE = "https://api.moralis-streams.com";

/** In-memory stream ID — set during init */
let streamId: string | null = null;

export function isMoralisStreamsEnabled(): boolean {
    return !!(config.MORALIS_API_KEY && config.MORALIS_WEBHOOK_SECRET);
}

/**
 * Initialize the Moralis Stream on startup.
 * Finds an existing stream matching our webhook URL, or creates a new one.
 *
 * @param baseUrl The public URL of our API (e.g. https://srv1418768.hstgr.cloud)
 */
export async function initMoralisStream(baseUrl: string): Promise<void> {
    if (!isMoralisStreamsEnabled()) {
        console.log("Moralis Streams: disabled (MORALIS_API_KEY or MORALIS_WEBHOOK_SECRET not set)");
        return;
    }

    const webhookUrl = `${baseUrl}/api/webhook/moralis`;

    try {
        // List existing streams — find one matching our webhook URL
        const listRes = await fetch(`${MORALIS_API_BASE}/streams/evm`, {
            headers: { "X-API-Key": config.MORALIS_API_KEY! },
        });

        if (!listRes.ok) {
            console.error(`Moralis Streams list failed: ${listRes.status}`);
            return;
        }

        const { result: streams } = await listRes.json() as {
            result: Array<{ id: string; webhookUrl: string }>;
        };

        const existing = streams?.find((s) => s.webhookUrl === webhookUrl);
        if (existing) {
            streamId = existing.id;
            console.log(`Moralis Stream found: ${streamId}`);
            return;
        }

        // Create a new stream monitoring native token transfers across all EVM chains
        const createRes = await fetch(`${MORALIS_API_BASE}/streams/evm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": config.MORALIS_API_KEY!,
            },
            body: JSON.stringify({
                webhookUrl,
                description: "SolSwap Whale Tracker — EVM wallets",
                tag: "solswap_whale_tracker",
                topic0: [], // We use address-level filtering, not topic filtering
                includeNativeTxs: true,   // Capture native ETH/BNB/MATIC transfers
                includeContractLogs: false,
                includeInternalTxs: false,
                chainIds: [
                    "0x1",    // Ethereum
                    "0x38",   // BNB Chain
                    "0x89",   // Polygon
                    "0xa4b1", // Arbitrum
                    "0x2105", // Base
                ],
                // Moralis webhook secret is set as the authHeader so we can verify payloads
                secretKey: config.MORALIS_WEBHOOK_SECRET!,
            }),
        });

        if (!createRes.ok) {
            const body = await createRes.text();
            console.error(`Moralis Stream creation failed: ${createRes.status} — ${body}`);
            return;
        }

        const created = await createRes.json() as { id: string };
        streamId = created.id;
        console.log(`Moralis Stream created: ${streamId}`);
    } catch (err) {
        console.error("Moralis Stream init error:", err instanceof Error ? err.message : err);
    }
}

/**
 * Add an EVM wallet address to the Moralis stream.
 * Called when a user adds an EVM watched wallet.
 */
export async function addAddressToMoralisStream(address: string): Promise<void> {
    if (!isMoralisStreamsEnabled() || !streamId) return;

    try {
        const res = await fetch(`${MORALIS_API_BASE}/streams/evm/${streamId}/address`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": config.MORALIS_API_KEY!,
            },
            body: JSON.stringify({ address }),
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`Moralis add address failed: ${res.status} — ${body}`);
            return;
        }
        console.log(`Moralis Stream: added EVM address ${address.slice(0, 8)}...`);
    } catch (err) {
        console.error("Moralis add address error:", err instanceof Error ? err.message : err);
    }
}

/**
 * Remove an EVM wallet address from the Moralis stream.
 * Called when a user unwatches an EVM wallet.
 */
export async function removeAddressFromMoralisStream(address: string): Promise<void> {
    if (!isMoralisStreamsEnabled() || !streamId) return;

    try {
        const res = await fetch(`${MORALIS_API_BASE}/streams/evm/${streamId}/address`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": config.MORALIS_API_KEY!,
            },
            body: JSON.stringify({ address }),
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`Moralis remove address failed: ${res.status} — ${body}`);
        }
    } catch (err) {
        console.error("Moralis remove address error:", err instanceof Error ? err.message : err);
    }
}
