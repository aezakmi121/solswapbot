import { Router, Request, Response } from "express";
import { findUserByTelegramId } from "../../db/queries/users";
import { getTransactions } from "../../db/queries/transactions";

export const transactionsRouter = Router();

/**
 * GET /api/transactions
 * Returns paginated, filtered transaction history (swaps + sends) for the authenticated user.
 *
 * Query params:
 *   type    — "all" | "swap" | "send"  (default: "all")
 *   preset  — "today" | "7d" | "30d"   (optional; overrides from/to)
 *   from    — ISO date, e.g. "2026-01-01"  (optional; ignored when preset is set)
 *   to      — ISO date, e.g. "2026-02-28"  (optional; inclusive end-of-day)
 *   offset  — integer ≥ 0  (default: 0)
 *   limit   — integer 1–50  (default: 20)
 *
 * Response:
 *   { transactions: UnifiedTransaction[], total: number, hasMore: boolean }
 */
transactionsRouter.get("/transactions", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // ── type ──────────────────────────────────────────────────────
        const type = String(req.query.type ?? "all");
        if (!["all", "swap", "send"].includes(type)) {
            res.status(400).json({ error: "Invalid type. Use: all, swap, send" });
            return;
        }

        // ── pagination ────────────────────────────────────────────────
        const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
        const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));

        // ── date range ────────────────────────────────────────────────
        let from: Date | undefined;
        let to: Date | undefined;

        const preset = req.query.preset as string | undefined;
        const VALID_PRESETS = ["today", "7d", "30d"];
        if (preset) {
            // L2: Reject unknown preset values instead of silently returning all
            if (!VALID_PRESETS.includes(preset)) {
                res.status(400).json({ error: "Invalid preset. Use: today, 7d, 30d" });
                return;
            }
            const now = new Date();
            to = now;
            if (preset === "today") {
                from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            } else if (preset === "7d") {
                from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            } else if (preset === "30d") {
                from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            }
        } else {
            if (req.query.from) {
                const d = new Date(String(req.query.from));
                if (!isNaN(d.getTime())) from = d;
            }
            if (req.query.to) {
                const d = new Date(String(req.query.to));
                if (!isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999); // inclusive end of "to" day
                    to = d;
                }
            }
        }

        const result = await getTransactions({
            userId: user.id,
            type: type as "all" | "swap" | "send",
            from,
            to,
            offset,
            limit,
        });

        res.json(result);
    } catch (err) {
        console.error("Transactions API error:", err);
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
});
