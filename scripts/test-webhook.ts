import "dotenv/config";
import fetch from "node-fetch";

// Localhost API port default
const API_URL = "http://localhost:3001/api/webhook/helius";

// We need the webhook secret from the .env file.
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET || "your_dev_secret_here";

// We need a wallet address that is currently "Watched" by your telegram user in the DB.
// Pass it as the first argument: ts-node scripts/mock-whale-alert.ts <watched_wallet>
const watchedAddress = process.argv[2];

if (!watchedAddress) {
    console.error("Please provide a watched wallet address as an argument.");
    console.error("Example: npx tsx scripts/test-webhook.ts 7xKXxyz...3mPa");
    process.exit(1);
}

// Famous USDC Mint
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const mockEvent = {
    accountData: [],
    description: `Token transfer of 5000 USDC from ${watchedAddress} to someone`,
    events: {},
    fee: 5000,
    feePayer: watchedAddress,
    instructions: [],
    nativeTransfers: [],
    signature: "MockSignature111" + Date.now().toString(),
    slot: 12345678,
    source: "SYSTEM_PROGRAM",
    timestamp: Math.floor(Date.now() / 1000),
    tokenTransfers: [
        {
            fromTokenAccount: "MockTokenAct1",
            toTokenAccount: "MockTokenAct2",
            fromUserAccount: watchedAddress, // Trigger "Sent" alert
            toUserAccount: "RandomReceiverAddress111",
            tokenAmount: 5000, // 5,000 USDC
            mint: USDC_MINT,
            tokenStandard: "Fungible"
        }
    ],
    transactionError: null,
    type: "TRANSFER"
};

async function run() {
    console.log(`Sending mock Helius event for wallet: ${watchedAddress}`);
    console.log(`Payload contains a 5,000 USDC transfer.`);
    console.log(`Target: ${API_URL}`);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": HELIUS_WEBHOOK_SECRET
            },
            body: JSON.stringify([mockEvent])
        });

        if (response.ok) {
            const data = await response.json();
            console.log("Webhook accepted successfully:", data);
            console.log("If the wallet is watched and the Telegram user is valid, you should receive a notification!");
        } else {
            console.error("Webhook rejected:", response.status, await response.text());
            console.error("Make sure your local API server is running on port 3001, and HELIUS_WEBHOOK_SECRET matches your .env file.");
        }
    } catch (e) {
        console.error("Failed to connect to API server. Is it running? (npm run dev)");
        console.error(e);
    }
}

run();
