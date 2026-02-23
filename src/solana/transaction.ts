import { connection } from "./connection";
import { prisma } from "../db/client";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes total

/**
 * Polls Solana for transaction confirmation after the user signs.
 * Updates the swap record in DB when confirmed or failed.
 *
 * Called after we detect that a transaction was submitted (e.g., from a
 * Phantom redirect callback or manual /status check).
 */
export async function pollTransactionStatus(
  swapId: string,
  txSignature: string,
): Promise<"CONFIRMED" | "FAILED"> {
  // Save signature immediately
  await prisma.swap.update({
    where: { id: swapId },
    data: { txSignature, status: "SUBMITTED" },
  });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const status = await connection.getSignatureStatus(txSignature, {
        searchTransactionHistory: false,
      });

      const value = status.value;
      if (value) {
        if (value.err) {
          // Transaction failed on-chain
          await prisma.swap.update({
            where: { id: swapId },
            data: { status: "FAILED" },
          });
          console.log(`Swap ${swapId} tx ${txSignature} FAILED on-chain`);
          return "FAILED";
        }

        const confirmationStatus = value.confirmationStatus;
        if (confirmationStatus === "confirmed" || confirmationStatus === "finalized") {
          await prisma.swap.update({
            where: { id: swapId },
            data: { status: "CONFIRMED" },
          });
          console.log(`Swap ${swapId} tx ${txSignature} CONFIRMED`);
          return "CONFIRMED";
        }
      }
    } catch (err) {
      console.error(`Poll attempt ${attempt + 1} failed for ${txSignature}:`, err);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Timed out — mark as failed
  await prisma.swap.update({
    where: { id: swapId },
    data: { status: "FAILED" },
  });
  console.log(`Swap ${swapId} tx ${txSignature} timed out — marked FAILED`);
  return "FAILED";
}

/**
 * Fire-and-forget version: starts polling in background without blocking.
 * Calls the optional callback when done.
 */
export function pollTransactionInBackground(
  swapId: string,
  txSignature: string,
  onComplete?: (result: "CONFIRMED" | "FAILED") => void,
): void {
  pollTransactionStatus(swapId, txSignature)
    .then((result) => onComplete?.(result))
    .catch((err) => console.error(`Background poll error for swap ${swapId}:`, err));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
