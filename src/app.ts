import { config } from "./config";
import { prisma } from "./db/client";
import { createBot } from "./bot";
import { startApiServer } from "./api/server";
import { pollTransactionInBackground } from "./solana/transaction";
import { initHeliusWebhook, isHeliusEnabled } from "./helius/client";

async function main(): Promise<void> {
  console.log(`Starting SolSwap Bot (${config.NODE_ENV})...`);

  // Verify database connection
  await prisma.$connect();
  console.log("Database connected");

  // Resume any swaps that were left in SUBMITTED state from a previous process
  // (e.g. server restarted mid-confirmation). Without this, those swaps stay
  // stuck as SUBMITTED forever and users see "Confirming..." indefinitely.
  const orphaned = await prisma.swap.findMany({
    where: { status: "SUBMITTED", txSignature: { not: null } },
    select: { id: true, txSignature: true },
  });
  if (orphaned.length > 0) {
    console.log(`Resuming ${orphaned.length} orphaned swap poller(s)...`);
    for (const swap of orphaned) {
      pollTransactionInBackground(swap.id, swap.txSignature!, (result) => {
        console.log(`Orphaned swap ${swap.id} resolved: ${result}`);
      });
    }
  }

  // Start the API server for Mini App — capture app so we can close the HTTP
  // server cleanly on shutdown (otherwise in-flight requests are hard-killed).
  const app = startApiServer();

  // Initialize Helius webhook for receive tracking (non-blocking, optional)
  if (isHeliusEnabled()) {
    const vpsUrl = config.CORS_ORIGIN; // VPS is proxied through the same origin
    initHeliusWebhook(vpsUrl).catch((err) => {
      console.error("Helius webhook init failed (non-fatal):", err);
    });
  }

  // Create and start the bot
  const bot = createBot();

  // Graceful shutdown: stop accepting new connections, finish in-flight requests,
  // then disconnect Prisma and exit.
  const shutdown = async () => {
    console.log("Shutting down...");
    bot.stop();

    // Close the HTTP server — stops accepting new connections, waits for
    // in-flight requests to complete before calling the callback.
    const server = (app as any)._server;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start polling for Telegram updates
  await bot.start({
    onStart: () => console.log("Bot is running! Listening for messages..."),
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
