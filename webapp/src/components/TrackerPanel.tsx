import { useState, useEffect, useCallback } from "react";
import { Activity, PieChart, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const tg = (window as any).Telegram?.WebApp;

interface WatchedWallet {
    id: string;
    walletAddress: string;
    label: string | null;
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

function formatUsd(val: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Component (Accordion Content)
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

function WalletPortfolio({ address, onClose }: { address: string; onClose: () => void }) {
    const [data, setData] = useState<PortfolioData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const renderContent = () => {
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

    return (
        <div className="tx-detail-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="tx-detail-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="tx-detail-header">
                    <span className="tx-detail-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <PieChart size={18} /> Portfolio Holdings
                    </span>
                    <button className="tx-detail-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="tx-detail-body" style={{ overflow: "visible", border: "none" }}>
                    {renderContent()}
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

    // Tab state
    const [activeTab, setActiveTab] = useState<"watchlist" | "add">("watchlist");

    // Add wallet form state
    const [addAddress, setAddAddress] = useState("");
    const [addLabel, setAddLabel] = useState("");
    const [addChain, setAddChain] = useState("solana");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

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
                    chain: addChain 
                }),
            });
            setAddAddress("");
            setAddLabel("");
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
                        <span className="tracker-upgrade-hint">
                            Upgrade to Whale Tracker for 20 slots
                        </span>
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
                            <select
                                className="tracker-input"
                                style={{ width: "35%", cursor: "pointer" }}
                                value={addChain}
                                onChange={(e) => setAddChain(e.target.value)}
                                disabled={adding || atLimit}
                            >
                                {Object.entries(CHAIN_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                            <input
                                className="tracker-input"
                                style={{ width: "65%" }}
                                type="text"
                                placeholder="Wallet address"
                                value={addAddress}
                                onChange={(e) => setAddAddress(e.target.value)}
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
                            {wallets.map((w) => {
                                const isOpen = openPortfolioId === w.walletAddress;
                                return (
                                    <li key={w.id} className="tracker-wallet-item-container">
                                        <div className="tracker-wallet-item">
                                            <div className="tracker-wallet-info">
                                                {w.label && (
                                                    <span className="tracker-wallet-label">{w.label}</span>
                                                )}
                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                    <span className="tracker-wallet-addr" title={w.walletAddress}>
                                                        <span style={{ fontSize: "0.7rem", opacity: 0.6, marginRight: "4px" }}>
                                                            {CHAIN_LABELS[w.chain] ?? w.chain}
                                                        </span>
                                                        {shortAddr(w.walletAddress)}
                                                    </span>
                                                    <button 
                                                        className="tracker-portfolio-btn"
                                                        onClick={() => togglePortfolio(w.walletAddress)}
                                                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                                                    >
                                                        <PieChart size={14} /> Holdings
                                                    </button>
                                                </div>
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
        </div>
    );
}
