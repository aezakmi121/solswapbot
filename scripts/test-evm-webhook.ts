import "dotenv/config";
import fetch from "node-fetch";
import crypto from "crypto";

// Localhost API port default
const API_URL = "http://localhost:3001/api/webhook/moralis";

// We need the webhook secret from the .env file.
const MORALIS_WEBHOOK_SECRET = process.env.MORALIS_WEBHOOK_SECRET || "your_dev_secret_here";

// We need a wallet address that is currently "Watched" by your telegram user in the DB.
// Pass it as the first argument: npx tsx scripts/test-evm-webhook.ts <watched_wallet>
const watchedAddress = process.argv[2];

if (!watchedAddress) {
    console.error("Please provide a watched EVM wallet address as an argument.");
    console.error("Example: npx tsx scripts/test-evm-webhook.ts 0x7dafba1d...");
    process.exit(1);
}

// Ensure proper EVM string formatting
const watchedEVM = watchedAddress.toLowerCase();

// Mock an Ethereum Mainnet (0x1) transfer of 2.5 ETH
const mockEvent = {
    chainId: "0x1",
    confirmed: true,
    nativeTxs: [
        {
            hash: "0x" + Date.now().toString(16) + "mockhash123",
            fromAddress: "0xRandomSenderAddress123",
            toAddress: watchedEVM, // Trigger "Received" alert
            value: "2500000000000000000", // 2.5 ETH in wei
            gas: "21000",
            chainId: "0x1"
        }
    ]
};

async function run() {
    console.log(`Sending mock Moralis event for wallet: ${watchedEVM}`);
    console.log(`Payload contains a 2.5 ETH receive transfer.`);
    console.log(`Target: ${API_URL}`);

    // Moralis requires a precise HMAC-SHA256 signature attached to the headers
    const bodyStr = JSON.stringify(mockEvent);
    const signature = crypto
        .createHash("sha3-256")
        .update(bodyStr + MORALIS_WEBHOOK_SECRET)
        .digest("hex");

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-signature": signature
            },
            body: bodyStr
        });

        if (response.ok) {
            console.log("Moralis Webhook accepted successfully:", response.status);
            console.log("If the wallet is watched and the Telegram user is valid, you should receive a notification!");
        } else {
            console.error("Moralis Webhook rejected:", response.status, await response.text());
            console.error("Make sure your local API server is running on port 3001, and MORALIS_WEBHOOK_SECRET matches your .env file.");
        }
    } catch (e) {
        console.error("Failed to connect to API server. Is it running? (npm run dev)");
        console.error(e);
    }
}

run();
