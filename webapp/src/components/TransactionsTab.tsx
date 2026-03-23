import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle2, XCircle, AlertCircle, Clock, ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Trash2, Copy, Search, FileText } from "lucide-react";
import { UnifiedTransaction, fetchTransactions, recheckSwap, hideTransaction } from "../lib/api";
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

function statusEmoji(status: string): React.ReactNode {
    switch (status.toUpperCase()) {
        case "CONFIRMED":  return <CheckCircle2 size={16} color="#22c55e" />;
        case "FAILED":     return <XCircle size={16} color="#ef4444" />;
        case "TIMEOUT":    return <AlertCircle size={16} color="#f59e0b" />;
        case "SUBMITTED":  return <Clock size={16} color="var(--text-muted)" />;
        case "PENDING":    return <Clock size={16} color="var(--text-muted)" />;
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

function TxRow({ tx, onClick, onHide }: { tx: UnifiedTransaction; onClick: () => void; onHide: (e: React.MouseEvent) => void }) {
    return (
        <button className="tx-row" onClick={onClick}>
            <span className="tx-row-icon">
                {tx.type === "swap" ? <ArrowRightLeft size={20} color="var(--accent)" />
                    : tx.type === "receive" ? <ArrowDownLeft size={20} color="var(--accent)" />
                    : <ArrowUpRight size={20} color="var(--accent)" />}
            </span>
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
                ) : tx.type === "receive" ? (
                    <>
                        <div className="tx-row-title">Received {tx.tokenSymbol}</div>
                        <div className="tx-row-sub">
                            {tx.humanAmount} {tx.tokenSymbol}
                            {tx.senderAddress && (
                                <span> from {shortAddr(tx.senderAddress)}</span>
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
                <span className="tx-row-hide" onClick={onHide} title="Hide transaction" style={{ color: "var(--text-muted)" }}>
                    <Trash2 size={16} />
                </span>
            </div>
        </button>
    );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function TxDetailModal({ tx, onClose, onStatusUpdate }: { tx: UnifiedTransaction; onClose: () => void; onStatusUpdate?: (id: string, status: string) => void }) {
    const [recheckLoading, setRecheckLoading] = useState(false);
    const [displayStatus, setDisplayStatus] = useState(tx.status);
    const [recheckMessage, setRecheckMessage] = useState<string | null>(null);

    const solscanLink = tx.txSignature
        ? `https://solscan.io/tx/${tx.txSignature}`
        : null;

    const isStuck = tx.type === "swap" && ["PENDING", "SUBMITTED", "TIMEOUT"].includes(displayStatus.toUpperCase());

    const copyTx = () => {
        if (!tx.txSignature) return;
        navigator.clipboard.writeText(tx.txSignature);
        toast("Transaction ID copied!", "success");
        tg?.HapticFeedback?.impactOccurred("light");
    };

    const handleRecheck = async () => {
        // Extract the actual swap ID (strip "swap_" prefix if present)
        const swapId = tx.id.startsWith("swap_") ? tx.id.slice(5) : tx.id;
        setRecheckLoading(true);
        setRecheckMessage(null);
        try {
            const result = await recheckSwap(swapId);
            setDisplayStatus(result.status);
            setRecheckMessage(result.message || null);
            onStatusUpdate?.(tx.id, result.status);
            tg?.HapticFeedback?.notificationOccurred(result.status === "CONFIRMED" ? "success" : "warning");
            if (result.status === "CONFIRMED") {
                toast("Transaction confirmed!", "success");
            } else if (result.status === "FAILED") {
                toast(result.message || "Transaction failed", "error");
            } else {
                toast("Status unchanged", "info");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to recheck";
            toast(msg, "error");
        } finally {
            setRecheckLoading(false);
        }
    };

    return (
        <div className="tx-detail-overlay" onClick={onClose}>
            <div className="tx-detail-sheet" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="tx-detail-header">
                    <span className="tx-detail-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {tx.type === "swap" ? <><ArrowRightLeft size={18} /> Swap Details</>
                            : tx.type === "receive" ? <><ArrowDownLeft size={18} /> Receive Details</>
                            : <><ArrowUpRight size={18} /> Send Details</>}
                    </span>
                    <button className="tx-detail-close" onClick={onClose}>✕</button>
                </div>

                {/* Status badge */}
                <div className={`tx-detail-status tx-detail-status--${displayStatus.toLowerCase()}`}>
                    {statusEmoji(displayStatus)} {statusLabel(displayStatus)}
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
                            {tx.type === "receive" && tx.senderAddress && (
                                <div className="tx-detail-row">
                                    <span>From</span>
                                    <span
                                        className="tx-detail-val tx-detail-addr"
                                        title={tx.senderAddress}
                                    >
                                        {shortAddr(tx.senderAddress)}
                                    </span>
                                </div>
                            )}
                            {tx.type === "send" && tx.recipientAddress && (
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
                        <button className="tx-detail-sig-copy" onClick={copyTx} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            {shortAddr(tx.txSignature)} <Copy size={14} />
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

                {/* Re-check button for stuck swaps */}
                {isStuck && (
                    <button
                        className="tx-detail-recheck"
                        onClick={handleRecheck}
                        disabled={recheckLoading}
                    >
                        {recheckLoading ? (
                            <><span className="btn-spinner" /> Checking on-chain...</>
                        ) : (
                            "🔍 Re-check status"
                        )}
                    </button>
                )}

                {/* Recheck result message */}
                {recheckMessage && (
                    <div className="tx-detail-recheck-msg">{recheckMessage}</div>
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
            const currentOffset = reset ? 0 : offsetRef.current;
            setLoading(true);

            try {
                const params: Parameters<typeof fetchTransactions>[0] = {
                    type: typeFilter as "all" | "swap" | "send" | "receive",
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
                        { id: "swap",    label: <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><ArrowRightLeft size={14} /> Swaps</span> },
                        { id: "send",    label: <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><ArrowUpRight size={14} /> Sends</span> },
                        { id: "receive", label: <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><ArrowDownLeft size={14} /> Receives</span> },
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

            {/* ── Date filter ── */}
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

            {/* ── Transaction list ── */}
            <>
                    {initialLoad ? (
                        <TxSkeleton />
                    ) : transactions.length === 0 ? (
                        <div className="tx-empty">
                            <div className="tx-empty-icon" style={{ display: "flex", justifyContent: "center", marginBottom: "12px", color: "var(--text-muted)" }}>
                                {typeFilter === "swap" ? <ArrowRightLeft size={32} /> : typeFilter === "send" ? <ArrowUpRight size={32} /> : typeFilter === "receive" ? <ArrowDownLeft size={32} /> : <FileText size={32} />}
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
                                            onHide={async (e) => {
                                                e.stopPropagation();
                                                const rawId = tx.id.startsWith("swap_") ? tx.id.slice(5) : tx.id.startsWith("send_") ? tx.id.slice(5) : tx.id.startsWith("receive_") ? tx.id.slice(8) : tx.id;
                                                
                                                // Optimistic UI update
                                                setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
                                                setTotal((prev) => Math.max(0, prev - 1));
                                                
                                                try {
                                                    await hideTransaction(rawId, tx.type);
                                                    toast("Transaction hidden", "success");
                                                } catch (err) {
                                                    toast("Failed to hide transaction", "error");
                                                }
                                            }}
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

            {/* ── Detail modal ── */}
            {selectedTx && (
                <TxDetailModal
                    tx={selectedTx}
                    onClose={() => setSelectedTx(null)}
                    onStatusUpdate={(id, newStatus) => {
                        setTransactions((prev) =>
                            prev.map((t) => t.id === id ? { ...t, status: newStatus } : t)
                        );
                    }}
                />
            )}
        </div>
    );
}
