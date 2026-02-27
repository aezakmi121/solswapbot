import { useState, useEffect, useCallback, useRef } from "react";
import { UnifiedTransaction, fetchTransactions } from "../lib/api";
import { toast } from "../lib/toast";

const tg = (window as any).Telegram?.WebApp;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatFullDate(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function monthKey(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function groupByMonth(
    txs: UnifiedTransaction[]
): Array<{ month: string; items: UnifiedTransaction[] }> {
    const map = new Map<string, UnifiedTransaction[]>();
    for (const tx of txs) {
        const key = monthKey(tx.createdAt);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(tx);
    }
    return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

function statusEmoji(status: string): string {
    switch (status.toUpperCase()) {
        case "CONFIRMED":  return "✅";
        case "FAILED":     return "❌";
        case "TIMEOUT":    return "⚠️";
        case "SUBMITTED":  return "⏳";
        case "PENDING":    return "⏳";
        default:           return "•";
    }
}

function statusLabel(status: string): string {
    switch (status.toUpperCase()) {
        case "CONFIRMED":  return "Confirmed";
        case "FAILED":     return "Failed";
        case "TIMEOUT":    return "Timed out";
        case "SUBMITTED":  return "Submitted";
        case "PENDING":    return "Pending";
        default:           return status;
    }
}

function shortAddr(addr: string): string {
    return addr.length > 16 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

// ── Transaction Row ───────────────────────────────────────────────────────────

function TxRow({ tx, onClick }: { tx: UnifiedTransaction; onClick: () => void }) {
    return (
        <button className="tx-row" onClick={onClick}>
            <span className="tx-row-icon">{tx.type === "swap" ? "🔄" : "📤"}</span>
            <div className="tx-row-body">
                {tx.type === "swap" ? (
                    <>
                        <div className="tx-row-title">
                            {tx.inputSymbol} → {tx.outputSymbol}
                        </div>
                        <div className="tx-row-sub">
                            {tx.inputAmount} {tx.inputSymbol} → {tx.outputAmount} {tx.outputSymbol}
                            {tx.feeAmountUsd != null && tx.feeAmountUsd > 0 && (
                                <span className="tx-row-fee"> · ${tx.feeAmountUsd.toFixed(2)} fee</span>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="tx-row-title">Sent {tx.tokenSymbol}</div>
                        <div className="tx-row-sub">
                            {tx.humanAmount} {tx.tokenSymbol}
                            {tx.recipientAddress && (
                                <span> → {shortAddr(tx.recipientAddress)}</span>
                            )}
                        </div>
                    </>
                )}
            </div>
            <div className="tx-row-right">
                <span className="tx-row-status-icon">{statusEmoji(tx.status)}</span>
                <span className="tx-row-date">{formatTimestamp(tx.createdAt)}</span>
            </div>
        </button>
    );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function TxDetailModal({ tx, onClose }: { tx: UnifiedTransaction; onClose: () => void }) {
    const solscanLink = tx.txSignature
        ? `https://solscan.io/tx/${tx.txSignature}`
        : null;

    const copyTx = () => {
        if (!tx.txSignature) return;
        navigator.clipboard.writeText(tx.txSignature);
        toast("Transaction ID copied!", "success");
        tg?.HapticFeedback?.impactOccurred("light");
    };

    return (
        <div className="tx-detail-overlay" onClick={onClose}>
            <div className="tx-detail-sheet" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="tx-detail-header">
                    <span className="tx-detail-title">
                        {tx.type === "swap" ? "🔄 Swap Details" : "📤 Send Details"}
                    </span>
                    <button className="tx-detail-close" onClick={onClose}>✕</button>
                </div>

                {/* Status badge */}
                <div className={`tx-detail-status tx-detail-status--${tx.status.toLowerCase()}`}>
                    {statusEmoji(tx.status)} {statusLabel(tx.status)}
                </div>

                {/* Detail rows */}
                <div className="tx-detail-body">
                    {tx.type === "swap" ? (
                        <>
                            <div className="tx-detail-row">
                                <span>You paid</span>
                                <span className="tx-detail-val">
                                    {tx.inputAmount} {tx.inputSymbol}
                                </span>
                            </div>
                            <div className="tx-detail-row">
                                <span>You received</span>
                                <span className="tx-detail-val">
                                    {tx.outputAmount} {tx.outputSymbol}
                                </span>
                            </div>
                            {tx.feeAmountUsd != null && tx.feeAmountUsd > 0 && (
                                <div className="tx-detail-row">
                                    <span>Platform fee</span>
                                    <span className="tx-detail-val">
                                        ${tx.feeAmountUsd.toFixed(2)}
                                    </span>
                                </div>
                            )}
                            {tx.inputChain && tx.outputChain && tx.inputChain !== tx.outputChain && (
                                <div className="tx-detail-row">
                                    <span>Bridge</span>
                                    <span className="tx-detail-val">
                                        {tx.inputChain} → {tx.outputChain}
                                    </span>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="tx-detail-row">
                                <span>Token</span>
                                <span className="tx-detail-val">{tx.tokenSymbol}</span>
                            </div>
                            <div className="tx-detail-row">
                                <span>Amount</span>
                                <span className="tx-detail-val">
                                    {tx.humanAmount} {tx.tokenSymbol}
                                </span>
                            </div>
                            {tx.recipientAddress && (
                                <div className="tx-detail-row">
                                    <span>Recipient</span>
                                    <span
                                        className="tx-detail-val tx-detail-addr"
                                        title={tx.recipientAddress}
                                    >
                                        {shortAddr(tx.recipientAddress)}
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    <div className="tx-detail-row">
                        <span>Date</span>
                        <span className="tx-detail-val">{formatFullDate(tx.createdAt)}</span>
                    </div>
                </div>

                {/* Signature row */}
                {tx.txSignature && (
                    <div className="tx-detail-sig-row">
                        <div className="tx-detail-sig-label">Transaction ID</div>
                        <button className="tx-detail-sig-copy" onClick={copyTx}>
                            {shortAddr(tx.txSignature)} 📋
                        </button>
                    </div>
                )}

                {/* Solscan link */}
                {solscanLink && (
                    <a
                        className="tx-detail-solscan"
                        href={solscanLink}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        View on Solscan ↗
                    </a>
                )}
            </div>
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TxSkeleton() {
    return (
        <div className="tx-skeleton">
            {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="tx-skeleton-row">
                    <div className="tx-skeleton-icon shimmer" />
                    <div className="tx-skeleton-lines">
                        <div className="tx-skeleton-line shimmer" style={{ width: "55%" }} />
                        <div className="tx-skeleton-line shimmer" style={{ width: "38%" }} />
                    </div>
                    <div className="tx-skeleton-right shimmer" />
                </div>
            ))}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

type TypeFilter = "all" | "swap" | "send" | "receive";
type DatePreset = "today" | "7d" | "30d" | "custom";

interface TransactionsTabProps {
    walletAddress: string;
}

export function TransactionsTab({ walletAddress }: TransactionsTabProps) {
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [preset, setPreset] = useState<DatePreset>("30d");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    const offsetRef = useRef(0);
    const [selectedTx, setSelectedTx] = useState<UnifiedTransaction | null>(null);

    const load = useCallback(
        async (reset: boolean) => {
            if (typeFilter === "receive") {
                setInitialLoad(false);
                return;
            }

            const currentOffset = reset ? 0 : offsetRef.current;
            setLoading(true);

            try {
                const params: Parameters<typeof fetchTransactions>[0] = {
                    type: typeFilter as "all" | "swap" | "send",
                    offset: currentOffset,
                    limit: 20,
                };

                if (preset !== "custom") {
                    params.preset = preset as "today" | "7d" | "30d";
                } else {
                    if (fromDate) params.from = fromDate;
                    if (toDate) params.to = toDate;
                }

                const result = await fetchTransactions(params);

                if (reset) {
                    setTransactions(result.transactions);
                } else {
                    setTransactions((prev) => [...prev, ...result.transactions]);
                }
                offsetRef.current = currentOffset + result.transactions.length;
                setTotal(result.total);
                setHasMore(result.hasMore);
            } catch {
                toast("Failed to load transactions", "error");
            } finally {
                setLoading(false);
                if (reset) setInitialLoad(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [typeFilter, preset, fromDate, toDate]
    );

    // Reload when filters change
    useEffect(() => {
        offsetRef.current = 0;
        setInitialLoad(true);
        load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typeFilter, preset, fromDate, toDate]);

    const grouped = groupByMonth(transactions);
    const showReceives = typeFilter === "receive";

    return (
        <div className="tx-tab">
            <div className="panel-header">
                <h2 className="panel-title">Transactions</h2>
            </div>

            {/* ── Type filter chips ── */}
            <div className="tx-type-filters">
                {(
                    [
                        { id: "all",     label: "All" },
                        { id: "swap",    label: "🔄 Swaps" },
                        { id: "send",    label: "📤 Sends" },
                        { id: "receive", label: "📥 Receives" },
                    ] as const
                ).map(({ id, label }) => (
                    <button
                        key={id}
                        className={`tx-filter-chip${typeFilter === id ? " tx-filter-chip--active" : ""}`}
                        onClick={() => {
                            tg?.HapticFeedback?.selectionChanged();
                            setTypeFilter(id);
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Date filter (hidden on Receives) ── */}
            {!showReceives && (
                <>
                    <div className="tx-date-filters">
                        {(
                            [
                                { id: "today",  label: "Today" },
                                { id: "7d",     label: "7 days" },
                                { id: "30d",    label: "30 days" },
                                { id: "custom", label: "📅 Custom" },
                            ] as const
                        ).map(({ id, label }) => (
                            <button
                                key={id}
                                className={`tx-date-chip${preset === id ? " tx-date-chip--active" : ""}`}
                                onClick={() => setPreset(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Custom date range inputs */}
                    {preset === "custom" && (
                        <div className="tx-custom-range">
                            <div className="tx-date-field">
                                <label>From</label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    max={toDate || undefined}
                                    onChange={(e) => setFromDate(e.target.value)}
                                />
                            </div>
                            <div className="tx-date-field">
                                <label>To</label>
                                <input
                                    type="date"
                                    value={toDate}
                                    min={fromDate || undefined}
                                    onChange={(e) => setToDate(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ── Receives placeholder ── */}
            {showReceives && (
                <div className="tx-receives-placeholder">
                    <div className="tx-receives-icon">📥</div>
                    <div className="tx-receives-title">Receive tracking coming soon</div>
                    <p className="tx-receives-desc">
                        Incoming transfers will appear here once Helius webhook integration
                        is complete in Phase 3.
                    </p>
                    <div className="tx-receives-addr-label">Your address for receiving:</div>
                    <button
                        className="tx-receives-addr"
                        onClick={() => {
                            navigator.clipboard.writeText(walletAddress);
                            toast("Address copied!", "success");
                            tg?.HapticFeedback?.impactOccurred("light");
                        }}
                    >
                        {walletAddress.slice(0, 6)}...{walletAddress.slice(-6)} 📋
                    </button>
                </div>
            )}

            {/* ── Transaction list ── */}
            {!showReceives && (
                <>
                    {initialLoad ? (
                        <TxSkeleton />
                    ) : transactions.length === 0 ? (
                        <div className="tx-empty">
                            <div className="tx-empty-icon">
                                {typeFilter === "swap" ? "🔄" : typeFilter === "send" ? "📤" : "📋"}
                            </div>
                            <p className="tx-empty-title">No transactions found</p>
                            <p className="tx-empty-sub">
                                {preset === "today"
                                    ? "No activity today"
                                    : preset === "7d"
                                    ? "No activity in the last 7 days"
                                    : preset === "30d"
                                    ? "No activity in the last 30 days"
                                    : "No transactions in this date range"}
                            </p>
                        </div>
                    ) : (
                        <>
                            {grouped.map(({ month, items }) => (
                                <div key={month} className="tx-month-group">
                                    <div className="tx-month-divider">
                                        <span className="tx-month-label">{month}</span>
                                        <span className="tx-month-count">
                                            {items.length}{" "}
                                            {items.length === 1 ? "transaction" : "transactions"}
                                        </span>
                                    </div>
                                    {items.map((tx) => (
                                        <TxRow
                                            key={tx.id}
                                            tx={tx}
                                            onClick={() => setSelectedTx(tx)}
                                        />
                                    ))}
                                </div>
                            ))}

                            {/* Load more */}
                            {hasMore && (
                                <button
                                    className="tx-load-more"
                                    onClick={() => load(false)}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <span className="btn-spinner" /> Loading...
                                        </>
                                    ) : (
                                        "Load 20 more"
                                    )}
                                </button>
                            )}

                            <div className="tx-count-line">
                                Showing {transactions.length} of {total}{" "}
                                {total === 1 ? "transaction" : "transactions"}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ── Detail modal ── */}
            {selectedTx && (
                <TxDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
            )}
        </div>
    );
}
