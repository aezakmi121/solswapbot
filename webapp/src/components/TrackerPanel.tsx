import { useState, useEffect, useCallback } from "react";
import { Activity, PieChart, X, ExternalLink, Copy } from "lucide-react";
import { UpgradeModal } from "./UpgradeModal";
import { EXPLORER_ADDRESS_URL } from "../lib/chains";
import { toast } from "../lib/toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const tg = (window as any).Telegram?.WebApp;

interface WatchedWallet {
    id: string;
    walletAddress: string;
    label: string | null;
    tag: string | null;
    chain: string;
    createdAt: string;
}

const CHAIN_LABELS: Record<string, string> = {
    solana: "Solana",
    ethereum: "Ethereum",
    bsc: "BNB Chain",
    polygon: "Polygon",
    arbitrum: "Arbitrum",
    base: "Base",
};

interface ListResponse {
    wallets: WatchedWallet[];
    count: number;
    limit: number | null; // null = unlimited (admin)
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const initData = tg?.initData ?? "";
    const res = await fetch(`${API_BASE}/api${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `tma ${initData}`,
            ...options?.headers,
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json();
}

function shortAddr(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Auto-detect chain from address format */
function detectChainFromAddress(addr: string): string | null {
    const trimmed = addr.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return "ethereum"; // EVM — default to Ethereum, user can switch
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return "solana";
    return null; // ambiguous or partial
}

function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr).then(() => {
        toast("Address copied!", "success");
        tg?.HapticFeedback?.selectionChanged();
    });
}

function openExplorer(chain: string, addr: string) {
    const baseUrl = EXPLORER_ADDRESS_URL[chain as keyof typeof EXPLORER_ADDRESS_URL];
    if (!baseUrl) return;
    const url = baseUrl + addr;
    if (tg?.openLink) {
        tg.openLink(url);
    } else {
        window.open(url, "_blank");
    }
}

function formatUsd(val: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio + Activity Modal
// ─────────────────────────────────────────────────────────────────────────────
interface PortfolioToken {
    chain: string;
    mint: string;
    symbol: string;
    name: string;
    icon: string | null;
    amount: number;
    decimals: number;
    priceUsd: number | null;
    priceChange24h: number | null;
    valueUsd: number | null;
}

interface PortfolioData {
    totalValueUsd: number;
    tokens: PortfolioToken[];
}

interface ActivityTx {
    signature: string;
    type: "send" | "receive" | "unknown";
    amount: number | null;
    symbol: string | null;
    counterparty: string | null;
    timestamp: number;
    explorerUrl: string;
}

function WalletPortfolio({ address, onClose }: { address: string; onClose: () => void }) {
    const [modalTab, setModalTab] = useState<"holdings" | "activity">("holdings");
    const [data, setData] = useState<PortfolioData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activityData, setActivityData] = useState<ActivityTx[] | null>(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const fetchPortfolio = async () => {
            try {
                const res = await apiRequest<{ totalValueUsd: number; tokens: PortfolioToken[] }>(
                    `/tracker/portfolio/${address}`
                );
                if (mounted) setData(res);
            } catch (err) {
                if (mounted) setError(err instanceof Error ? err.message : "Failed to load holdings");
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchPortfolio();
        return () => { mounted = false; };
    }, [address]);

    // Lazy-load activity on first tab switch (with 35s timeout)
    useEffect(() => {
        if (modalTab !== "activity" || activityData !== null || activityLoading) return;
        let mounted = true;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);
        setActivityLoading(true);
        apiRequest<{ transactions: ActivityTx[] }>(`/tracker/activity/${address}`, { signal: controller.signal })
            .then(res => { if (mounted) setActivityData(res.transactions); })
            .catch(err => {
                if (mounted) {
                    const msg = controller.signal.aborted ? "Request timed out" : (err instanceof Error ? err.message : "Failed to load");
                    setActivityError(msg);
                }
            })
            .finally(() => { clearTimeout(timeoutId); if (mounted) setActivityLoading(false); });
        return () => { mounted = false; controller.abort(); };
    }, [modalTab, address, activityData, activityLoading]);

    const renderHoldings = () => {
        if (loading) {
            return (
                <div className="tracker-portfolio-drawer" style={{ border: 'none', background: 'transparent' }}>
                    <div className="spinner" style={{ width: 16, height: 16, margin: "auto" }} />
                </div>
            );
        }

        if (error) {
            return (
                <div className="tracker-portfolio-drawer" style={{ border: 'none', background: 'transparent' }}>
                    <p className="tracker-error" style={{ fontSize: "0.8rem", margin: 0 }}>{error}</p>
                </div>
            );
        }

        if (!data || data.tokens.length === 0) {
            return (
                <div className="tracker-portfolio-drawer" style={{ border: 'none', background: 'transparent' }}>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
                        No significant token holdings found.
                    </p>
                </div>
            );
        }

        let totalValueWithChange = 0;
        let validWeightValue = 0;
        for (const t of data.tokens) {
            if (t.valueUsd && t.priceChange24h !== null) {
                totalValueWithChange += (t.valueUsd * t.priceChange24h) / 100;
                validWeightValue += t.valueUsd;
            }
        }
        const overallChangePct = validWeightValue > 0 ? (totalValueWithChange / validWeightValue) * 100 : 0;
        const isPositive = overallChangePct >= 0;

        return (
            <div className="tracker-portfolio-drawer" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                <div className="tracker-portfolio-header" style={{ marginBottom: "1rem" }}>
                    <div>
                        <span className="tracker-portfolio-label">Net Worth</span>
                        <div className="tracker-portfolio-value">{formatUsd(data.totalValueUsd)}</div>
                    </div>
                    {validWeightValue > 0 && (
                        <div style={{ textAlign: "right" }}>
                            <span className="tracker-portfolio-label">24h Change</span>
                            <div className={`tracker-portfolio-change ${isPositive ? 'positive' : 'negative'}`}>
                                {isPositive ? '+' : ''}{formatUsd(totalValueWithChange)} ({isPositive ? '+' : ''}{overallChangePct.toFixed(2)}%)
                            </div>
                        </div>
                    )}
                </div>

                <div className="tracker-portfolio-scroll">
                    <table className="tracker-portfolio-table">
                        <tbody>
                            {data.tokens.map((t, idx) => {
                                const tPos = (t.priceChange24h ?? 0) >= 0;
                                return (
                                    <tr key={`${t.mint}-${idx}`}>
                                        <td className="tracker-token-col">
                                            {t.icon ? <img src={t.icon} alt="" className="tracker-token-icon" /> : <div className="tracker-token-icon-fallback" />}
                                            <span>{t.symbol}</span>
                                        </td>
                                        <td className="tracker-bal-col">
                                            {t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                        </td>
                                        <td className="tracker-price-col">
                                            <div className="tracker-token-price">{t.priceUsd ? formatUsd(t.priceUsd) : "—"}</div>
                                            {t.priceChange24h !== null && (
                                                <div className={`tracker-token-pxchange ${tPos ? 'positive' : 'negative'}`}>
                                                    {tPos ? '+' : ''}{t.priceChange24h.toFixed(2)}%
                                                </div>
                                            )}
                                        </td>
                                        <td className="tracker-val-col">
                                            {t.valueUsd ? formatUsd(t.valueUsd) : "—"}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderActivity = () => {
        if (activityLoading) {
            return (
                <div className="tracker-portfolio-drawer" style={{ border: 'none', background: 'transparent' }}>
                    <div className="spinner" style={{ width: 16, height: 16, margin: "auto" }} />
                </div>
            );
        }

        if (activityError) {
            return (
                <div className="tracker-portfolio-drawer" style={{ border: 'none', background: 'transparent' }}>
                    <p className="tracker-error" style={{ fontSize: "0.8rem", margin: 0 }}>{activityError}</p>
                </div>
            );
        }

        if (!activityData || activityData.length === 0) {
            return (
                <div className="tracker-portfolio-drawer" style={{ border: 'none', background: 'transparent' }}>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
                        No recent activity found.
                    </p>
                </div>
            );
        }

        return (
            <div className="tracker-activity-list">
                {activityData.map((tx, idx) => {
                    const dirEmoji = tx.type === "receive" ? "📥" : tx.type === "send" ? "📤" : "🔄";
                    const timeStr = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    }) : "—";
                    return (
                        <div key={`${tx.signature}-${idx}`} className="tracker-activity-item">
                            <div className="tracker-activity-left">
                                <span className="tracker-activity-emoji">{dirEmoji}</span>
                                <div>
                                    <div className="tracker-activity-amount">
                                        {tx.amount !== null ? tx.amount.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                                        {tx.symbol && ` ${tx.symbol}`}
                                    </div>
                                    {tx.counterparty && (
                                        <div className="tracker-activity-counterparty">
                                            {tx.type === "receive" ? "From" : "To"} {shortAddr(tx.counterparty)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="tracker-activity-right">
                                <div className="tracker-activity-time">{timeStr}</div>
                                <a
                                    className="tracker-activity-link"
                                    href={tx.explorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (tg?.openLink) tg.openLink(tx.explorerUrl);
                                        else window.open(tx.explorerUrl, "_blank");
                                    }}
                                >
                                    <ExternalLink size={12} />
                                </a>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="tx-detail-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="tx-detail-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="tx-detail-header">
                    <span className="tx-detail-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <PieChart size={18} /> Wallet Details
                    </span>
                    <button className="tx-detail-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="tracker-modal-tabs">
                    <button
                        className={`tracker-modal-tab ${modalTab === "holdings" ? "active" : ""}`}
                        onClick={() => setModalTab("holdings")}
                    >Holdings</button>
                    <button
                        className={`tracker-modal-tab ${modalTab === "activity" ? "active" : ""}`}
                        onClick={() => setModalTab("activity")}
                    >Activity</button>
                </div>
                <div className="tx-detail-body" style={{ overflow: "visible", border: "none" }}>
                    {modalTab === "holdings" ? renderHoldings() : renderActivity()}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Tracker Panel
// ─────────────────────────────────────────────────────────────────────────────

export function TrackerPanel() {
    const [wallets, setWallets] = useState<WatchedWallet[]>([]);
    const [limit, setLimit] = useState<number | null>(3);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showUpgrade, setShowUpgrade] = useState(false);

    // Tab state
    const [activeTab, setActiveTab] = useState<"watchlist" | "add">("watchlist");

    // Add wallet form state
    const [addAddress, setAddAddress] = useState("");
    const [addLabel, setAddLabel] = useState("");
    const [addTag, setAddTag] = useState("");
    const [addChain, setAddChain] = useState("solana");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    // Tag filter state
    const [filterTag, setFilterTag] = useState<string | null>(null);

    // Inline edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editTag, setEditTag] = useState("");

    // Accordion state (which wallet has its portfolio open)
    const [openPortfolioId, setOpenPortfolioId] = useState<string | null>(null);

    const loadWallets = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await apiRequest<ListResponse>("/tracker/list");
            setWallets(data.wallets);
            setLimit(data.limit);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load wallets");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadWallets(); }, [loadWallets]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addAddress.trim()) return;
        setAdding(true);
        setAddError(null);
        try {
            await apiRequest("/tracker/watch", {
                method: "POST",
                body: JSON.stringify({
                    walletAddress: addAddress.trim(),
                    label: addLabel.trim() || undefined,
                    tag: addTag.trim() || undefined,
                    chain: addChain
                }),
            });
            setAddAddress("");
            setAddLabel("");
            setAddTag("");
            await loadWallets();
            setActiveTab("watchlist"); // switch back to list
        } catch (err) {
            setAddError(err instanceof Error ? err.message : "Failed to add wallet");
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (walletAddress: string) => {
        try {
            await apiRequest("/tracker/unwatch", {
                method: "POST",
                body: JSON.stringify({ walletAddress }),
            });
            setWallets((prev) => prev.filter((w) => w.walletAddress !== walletAddress));
            if (openPortfolioId === walletAddress) {
                setOpenPortfolioId(null);
            }
        } catch {
            // Silently retry on next reload
            loadWallets();
        }
    };

    const togglePortfolio = (address: string) => {
        setOpenPortfolioId(prev => prev === address ? null : address);
    };

    const startEditing = (w: WatchedWallet) => {
        setEditingId(w.id);
        setEditLabel(w.label ?? "");
        setEditTag(w.tag ?? "");
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditLabel("");
        setEditTag("");
    };

    const saveEdit = async (walletAddress: string) => {
        try {
            await apiRequest("/tracker/update", {
                method: "PATCH",
                body: JSON.stringify({
                    walletAddress,
                    label: editLabel.trim(),
                    tag: editTag.trim(),
                }),
            });
            toast("Wallet updated", "success");
            tg?.HapticFeedback?.notificationOccurred("success");
            setEditingId(null);
            await loadWallets();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Update failed", "error");
        }
    };

    // Collect unique tags for filter chips + autocomplete
    const allTags = [...new Set(wallets.map(w => w.tag).filter((t): t is string => !!t))].sort();

    // Filter wallets by selected tag
    const filteredWallets = filterTag ? wallets.filter(w => w.tag === filterTag) : wallets;

    const slotsUsed = wallets.length;
    const slotsTotal = limit ?? "∞";
    const atLimit = limit !== null && slotsUsed >= limit;

    return (
        <div className="tracker-panel">
            {/* ── Header ── */}
            <div className="tracker-header">
                <div className="tracker-title-row">
                    <span className="tracker-eye-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><Activity size={24} /></span>
                    <h2 className="tracker-title">Whale Tracker</h2>
                </div>
                <p className="tracker-subtitle">
                    Get alerted in real-time when a watched wallet sends or receives large amounts.
                </p>
                <div className="tracker-slots">
                    <span className={`tracker-slot-badge ${atLimit ? "tracker-slot-badge--full" : ""}`}>
                        {slotsUsed} / {slotsTotal} slots
                    </span>
                    {atLimit && limit === 3 && (
                        <button
                            className="tracker-upgrade-btn"
                            onClick={() => setShowUpgrade(true)}
                        >
                            Upgrade to Whale Tracker for 20 slots
                        </button>
                    )}
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="tracker-tabs">
                <button 
                    className={`tracker-tab ${activeTab === "watchlist" ? "active" : ""}`}
                    onClick={() => setActiveTab("watchlist")}
                >
                    My Watchlist
                </button>
                <button 
                    className={`tracker-tab ${activeTab === "add" ? "active" : ""}`}
                    onClick={() => setActiveTab("add")}
                >
                    Add New
                </button>
            </div>

            {/* ── Add New Tab ── */}
            {activeTab === "add" && (
                <div className="tracker-tab-content">
                    <form className="tracker-add-form" onSubmit={handleAdd}>
                        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                            {addChain !== "solana" && (
                                <select
                                    className="tracker-input"
                                    style={{ width: "35%", cursor: "pointer" }}
                                    value={addChain}
                                    onChange={(e) => setAddChain(e.target.value)}
                                    disabled={adding || atLimit}
                                >
                                    {Object.entries(CHAIN_LABELS).filter(([key]) => key !== "solana").map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            )}
                            {addChain === "solana" && (
                                <div className="tracker-input tracker-chain-badge" style={{ width: "35%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    🟣 Solana
                                </div>
                            )}
                            <input
                                className="tracker-input"
                                style={{ width: "65%" }}
                                type="text"
                                placeholder="Wallet address"
                                value={addAddress}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setAddAddress(val);
                                    const detected = detectChainFromAddress(val);
                                    if (detected) setAddChain(detected);
                                }}
                                disabled={adding || atLimit}
                                maxLength={44}
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </div>
                        <input
                            className="tracker-input tracker-input--label"
                            type="text"
                            placeholder="Label (optional, e.g. Whale A)"
                            value={addLabel}
                            onChange={(e) => setAddLabel(e.target.value)}
                            disabled={adding || atLimit}
                            maxLength={40}
                        />
                        <input
                            className="tracker-input tracker-input--label"
                            type="text"
                            placeholder="Tag (optional, e.g. VCs, DEX Whales)"
                            value={addTag}
                            onChange={(e) => setAddTag(e.target.value)}
                            disabled={adding || atLimit}
                            maxLength={30}
                            list="tracker-tags-datalist"
                        />
                        {allTags.length > 0 && (
                            <datalist id="tracker-tags-datalist">
                                {allTags.map(t => <option key={t} value={t} />)}
                            </datalist>
                        )}
                        <button
                            className="tracker-add-btn swap-btn"
                            type="submit"
                            disabled={adding || atLimit || !addAddress.trim()}
                        >
                            {adding ? "Adding…" : atLimit ? "Limit reached" : "Watch Wallet"}
                        </button>
                        {addError && <p className="tracker-error">{addError}</p>}
                    </form>
                </div>
            )}

            {/* ── Watchlist Tab ── */}
            {activeTab === "watchlist" && (
                <div className="tracker-tab-content">
                    {/* Tag filter chips */}
                    {allTags.length > 0 && (
                        <div className="tracker-tag-filters">
                            <button
                                className={`tracker-tag-chip ${filterTag === null ? "active" : ""}`}
                                onClick={() => setFilterTag(null)}
                            >All</button>
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    className={`tracker-tag-chip ${filterTag === tag ? "active" : ""}`}
                                    onClick={() => setFilterTag(prev => prev === tag ? null : tag)}
                                >{tag}</button>
                            ))}
                        </div>
                    )}
                    {loading ? (
                        <div className="tracker-loading">
                            <div className="spinner" />
                        </div>
                    ) : error ? (
                        <p className="tracker-error">{error}</p>
                    ) : wallets.length === 0 ? (
                        <div className="tracker-empty">
                            <p>No wallets watched yet.</p>
                            <button className="tracker-empty-btn" onClick={() => setActiveTab("add")}>
                                + Add a Wallet
                            </button>
                        </div>
                    ) : (
                        <ul className="tracker-wallet-list">
                            {filteredWallets.map((w) => {
                                const isEditing = editingId === w.id;
                                return (
                                    <li key={w.id} className="tracker-wallet-item-container">
                                        <div className="tracker-wallet-item">
                                            <div className="tracker-wallet-info">
                                                {isEditing ? (
                                                    <div className="tracker-edit-row">
                                                        <input
                                                            className="tracker-input tracker-edit-input"
                                                            type="text"
                                                            placeholder="Label"
                                                            value={editLabel}
                                                            onChange={(e) => setEditLabel(e.target.value)}
                                                            maxLength={40}
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") saveEdit(w.walletAddress);
                                                                if (e.key === "Escape") cancelEditing();
                                                            }}
                                                        />
                                                        <input
                                                            className="tracker-input tracker-edit-input"
                                                            type="text"
                                                            placeholder="Tag"
                                                            value={editTag}
                                                            onChange={(e) => setEditTag(e.target.value)}
                                                            maxLength={30}
                                                            list="tracker-tags-datalist"
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") saveEdit(w.walletAddress);
                                                                if (e.key === "Escape") cancelEditing();
                                                            }}
                                                        />
                                                        <div style={{ display: "flex", gap: "4px" }}>
                                                            <button className="tracker-edit-save" onClick={() => saveEdit(w.walletAddress)}>Save</button>
                                                            <button className="tracker-edit-cancel" onClick={cancelEditing}>Cancel</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            <span
                                                                className="tracker-wallet-label"
                                                                onClick={() => startEditing(w)}
                                                                title="Click to edit"
                                                                style={{ cursor: "pointer" }}
                                                            >
                                                                {w.label || <span style={{ opacity: 0.4, fontStyle: "italic" }}>Add label</span>}
                                                            </span>
                                                            {w.tag && <span className="tracker-tag-pill">{w.tag}</span>}
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                            <span className="tracker-wallet-addr" title={w.walletAddress}>
                                                                <span style={{ fontSize: "0.7rem", opacity: 0.6, marginRight: "4px" }}>
                                                                    {CHAIN_LABELS[w.chain] ?? w.chain}
                                                                </span>
                                                                {shortAddr(w.walletAddress)}
                                                            </span>
                                                            <button
                                                                className="tracker-icon-btn"
                                                                onClick={() => copyAddress(w.walletAddress)}
                                                                title="Copy address"
                                                            >
                                                                <Copy size={12} />
                                                            </button>
                                                            <button
                                                                className="tracker-icon-btn"
                                                                onClick={() => openExplorer(w.chain, w.walletAddress)}
                                                                title="View on explorer"
                                                            >
                                                                <ExternalLink size={12} />
                                                            </button>
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                                                            <button
                                                                className="tracker-portfolio-btn"
                                                                onClick={() => togglePortfolio(w.walletAddress)}
                                                                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                                                            >
                                                                <PieChart size={14} /> Holdings
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <button
                                                className="tracker-remove-btn"
                                                onClick={() => handleRemove(w.walletAddress)}
                                                title="Stop watching"
                                                aria-label={`Remove ${w.label ?? w.walletAddress}`}
                                                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {/* ── Alert threshold note ── */}
            <p className="tracker-footer-note" style={{ marginTop: "1rem" }}>
                🔔 Alerts fire via Telegram (≥ 10 SOL, or ≥ 1 ETH/native EVM token)
            </p>

            {/* Floating Portfolio Modal */}
            {openPortfolioId && (
                <WalletPortfolio
                    address={openPortfolioId}
                    onClose={() => setOpenPortfolioId(null)}
                />
            )}

            <UpgradeModal
                open={showUpgrade}
                onClose={() => setShowUpgrade(false)}
                highlightTier="WHALE_TRACKER"
            />
        </div>
    );
}
