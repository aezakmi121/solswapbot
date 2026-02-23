import { config } from "./config";
import { prisma } from "./db/client";
import { createBot } from "./bot";

async function main(): Promise<void> {
  console.log(`Starting SolSwap Bot (${config.NODE_ENV})...`);

  // Verify database connection
  await prisma.$connect();
  console.log("Database connected");

  // Create and start the bot
  const bot = createBot();

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    bot.stop();
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
