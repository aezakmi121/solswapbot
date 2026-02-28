import { config } from "../config";

const HELIUS_API_BASE = "https://api.helius.xyz/v0";

/** In-memory webhook ID — set during init or from env */
let webhookId: string | null = null;

/** Whether the Helius webhook feature is available */
export function isHeliusEnabled(): boolean {
    return !!(config.HELIUS_API_KEY && config.HELIUS_WEBHOOK_SECRET);
}

/**
 * Extract the Helius API key. Uses HELIUS_API_KEY env var, or falls back
 * to parsing it from the SOLANA_RPC_URL if it contains a Helius endpoint.
 */
function getApiKey(): string {
    if (config.HELIUS_API_KEY) return config.HELIUS_API_KEY;

    // Fallback: extract from RPC URL (https://mainnet.helius-rpc.com/?api-key=XXX)
    try {
        const url = new URL(config.SOLANA_RPC_URL);
        const key = url.searchParams.get("api-key");
        if (key) return key;
    } catch {
        // not a valid URL
    }

    throw new Error("HELIUS_API_KEY not set and could not be extracted from SOLANA_RPC_URL");
}

/**
 * Initialize the Helius webhook on startup.
 * Finds an existing webhook matching our URL, or creates a new one.
 * Populates the in-memory webhookId for later use.
 *
 * @param baseUrl The public URL of our API (e.g. https://srv1418768.hstgr.cloud)
 */
export async function initHeliusWebhook(baseUrl: string): Promise<void> {
    if (!isHeliusEnabled()) return;

    const apiKey = getApiKey();
    const webhookUrl = `${baseUrl}/api/webhook/helius`;

    try {
        // List existing webhooks — find one matching our URL
        const listRes = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${apiKey}`);
        if (!listRes.ok) {
            console.error(`Helius webhook list failed: ${listRes.status}`);
            return;
        }

        const webhooks = await listRes.json() as Array<{ webhookID: string; webhookURL: string }>;
        const existing = webhooks.find((w) => w.webhookURL === webhookUrl);

        if (existing) {
            webhookId = existing.webhookID;
            console.log(`Helius webhook found: ${webhookId}`);
            return;
        }

        // Collect all wallet addresses from existing users to watch
        // Import inline to avoid circular deps at module level
        const { prisma } = await import("../db/client");
        const users = await prisma.user.findMany({
            where: { walletAddress: { not: null } },
            select: { walletAddress: true },
        });
        const addresses = users
            .map((u) => u.walletAddress!)
            .filter(Boolean);

        // Create a new webhook
        const createRes = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                webhookURL: webhookUrl,
                transactionTypes: ["TRANSFER"],
                accountAddresses: addresses,
                webhookType: "enhanced",
                authHeader: config.HELIUS_WEBHOOK_SECRET,
            }),
        });

        if (!createRes.ok) {
            const body = await createRes.text();
            console.error(`Helius webhook creation failed: ${createRes.status} — ${body}`);
            return;
        }

        const created = await createRes.json() as { webhookID: string };
        webhookId = created.webhookID;
        console.log(`Helius webhook created: ${webhookId} watching ${addresses.length} address(es)`);
    } catch (err) {
        console.error("Helius webhook init error:", err);
    }
}

/**
 * Add a wallet address to the Helius webhook watch list.
 * Called when a user connects their wallet via POST /api/user/wallet.
 * Non-blocking — failures are logged but don't break wallet registration.
 */
export async function addAddressToWebhook(address: string): Promise<void> {
    if (!isHeliusEnabled() || !webhookId) return;

    const apiKey = getApiKey();

    try {
        // Fetch current webhook to get existing addresses
        const getRes = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${apiKey}`);
        if (!getRes.ok) {
            console.error(`Helius get webhook failed: ${getRes.status}`);
            return;
        }

        const webhook = await getRes.json() as { accountAddresses: string[] };
        const existing = webhook.accountAddresses ?? [];

        // Skip if address is already watched
        if (existing.includes(address)) return;

        // Update with the new address appended
        const updateRes = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${apiKey}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                accountAddresses: [...existing, address],
            }),
        });

        if (!updateRes.ok) {
            const body = await updateRes.text();
            console.error(`Helius add address failed: ${updateRes.status} — ${body}`);
            return;
        }

        console.log(`Helius webhook: added address ${address.slice(0, 8)}...`);
    } catch (err) {
        console.error("Helius add address error:", err);
    }
}
