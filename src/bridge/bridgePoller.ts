import { prisma } from "../db/client";
import { CHAINS } from "../aggregator/chains";

const POLL_INTERVAL_MS = 60_000; // 1 minute
const MAX_AGE_HOURS = 24;

/**
 * Background bridge status poller.
 *
 * Every 60 seconds, queries all cross-chain Swap records stuck as SUBMITTED,
 * checks their status via the LI.FI status API, and updates the DB accordingly.
 *
 * This prevents bridge records from staying SUBMITTED forever when users close
 * the app mid-bridge.
 *
 * Statuses:
 *   LI.FI "DONE"      → DB CONFIRMED
 *   LI.FI "FAILED"    → DB FAILED
 *   Age > 24h         → DB TIMEOUT
 *   LI.FI "PENDING"   → no change (will be checked next cycle)
 */
export function startBridgePoller(): void {
    console.log("Bridge status poller started (60s interval)");
    // Run once immediately, then on interval
    pollSubmittedBridges().catch((err) => console.error("Initial bridge poll error:", err));
    setInterval(() => {
        pollSubmittedBridges().catch((err) => console.error("Bridge poll error:", err));
    }, POLL_INTERVAL_MS);
}

async function pollSubmittedBridges(): Promise<void> {
    // Find all SUBMITTED swaps, then filter to cross-chain only
    const stuckSwaps = await prisma.swap.findMany({
        where: { status: "SUBMITTED" },
    });

    // Filter to only cross-chain (inputChain !== outputChain)
    const crossChainSwaps = stuckSwaps.filter((s) => s.inputChain !== s.outputChain);

    if (crossChainSwaps.length === 0) return;

    console.log(`Bridge poller: checking ${crossChainSwaps.length} stuck bridge(s)`);

    for (const swap of crossChainSwaps) {
        try {
            if (!swap.txSignature) continue;

            const fromChain = CHAINS[swap.inputChain];
            const toChain = CHAINS[swap.outputChain];
            if (!fromChain || !toChain) continue;

            // Check age — timeout if > 24 hours
            const ageHours = (Date.now() - swap.createdAt.getTime()) / (1000 * 60 * 60);
            if (ageHours > MAX_AGE_HOURS) {
                await prisma.swap.update({
                    where: { id: swap.id },
                    data: { status: "TIMEOUT" },
                });
                console.log(`Bridge poller: TIMEOUT swap ${swap.id} (age: ${ageHours.toFixed(1)}h)`);
                continue;
            }

            // Query LI.FI status API
            const params = new URLSearchParams({
                txHash: swap.txSignature,
                fromChain: fromChain.lifiChainId,
                toChain: toChain.lifiChainId,
            });

            const response = await fetch(`https://li.quest/v1/status?${params}`, {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) {
                // 404 = not found yet, skip
                if (response.status === 404) continue;
                console.warn(`Bridge poller: LI.FI status API returned ${response.status} for swap ${swap.id}`);
                continue;
            }

            const data = (await response.json()) as any;
            const lifiStatus = data.status as string;

            if (lifiStatus === "DONE") {
                await prisma.swap.update({
                    where: { id: swap.id },
                    data: { status: "CONFIRMED" },
                });
                console.log(`Bridge poller: CONFIRMED swap ${swap.id}`);
            } else if (lifiStatus === "FAILED") {
                await prisma.swap.update({
                    where: { id: swap.id },
                    data: { status: "FAILED" },
                });
                console.log(`Bridge poller: FAILED swap ${swap.id}`);
            }
            // PENDING / NOT_FOUND = do nothing, check again next cycle
        } catch (err) {
            console.error(`Bridge poller: error checking swap ${swap.id}:`, err);
        }
    }
}
