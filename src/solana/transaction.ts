import { connection } from "./connection";
import { prisma } from "../db/client";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutes total (handles mainnet congestion)

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
): Promise<"CONFIRMED" | "FAILED" | "TIMEOUT"> {
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

  // Timed out — search transaction history as a final check before giving up (H10)
  try {
    const finalCheck = await connection.getSignatureStatus(txSignature, {
      searchTransactionHistory: true,
    });
    if (finalCheck.value?.confirmationStatus === "confirmed" || finalCheck.value?.confirmationStatus === "finalized") {
      await prisma.swap.update({
        where: { id: swapId },
        data: { status: "CONFIRMED" },
      });
      console.log(`Swap ${swapId} tx ${txSignature} CONFIRMED (found in history after timeout)`);
      return "CONFIRMED";
    }
    if (finalCheck.value?.err) {
      await prisma.swap.update({
        where: { id: swapId },
        data: { status: "FAILED" },
      });
      console.log(`Swap ${swapId} tx ${txSignature} FAILED on-chain (found in history)`);
      return "FAILED";
    }
  } catch {
    // Final check failed — fall through to mark as failed
  }

  // Truly timed out with no on-chain result — don't mark as FAILED since the
  // tx may still confirm later. Use TIMEOUT so the frontend can show an
  // appropriate message instead of a definitive "failed" (H10).
  await prisma.swap.update({
    where: { id: swapId },
    data: { status: "TIMEOUT" },
  });
  console.log(`Swap ${swapId} tx ${txSignature} timed out — marked TIMEOUT (may still confirm)`);
  return "TIMEOUT";
}

/**
 * Fire-and-forget version: starts polling in background without blocking.
 * Calls the optional callback when done.
 */
export function pollTransactionInBackground(
  swapId: string,
  txSignature: string,
  onComplete?: (result: "CONFIRMED" | "FAILED" | "TIMEOUT") => void,
): void {
  pollTransactionStatus(swapId, txSignature)
    .then((result) => onComplete?.(result))
    .catch((err) => console.error(`Background poll error for swap ${swapId}:`, err));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
