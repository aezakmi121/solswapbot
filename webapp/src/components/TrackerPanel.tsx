import { useState, useEffect, useCallback } from "react";

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

export function TrackerPanel() {
    const [wallets, setWallets] = useState<WatchedWallet[]>([]);
    const [limit, setLimit] = useState<number | null>(3);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add wallet form state
    const [addAddress, setAddAddress] = useState("");
    const [addLabel, setAddLabel] = useState("");
    const [addChain, setAddChain] = useState("solana");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

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
        } catch {
            // Silently retry on next reload
            loadWallets();
        }
    };

    const slotsUsed = wallets.length;
    const slotsTotal = limit ?? "∞";
    const atLimit = limit !== null && slotsUsed >= limit;

    return (
        <div className="tracker-panel">
            {/* ── Header ── */}
            <div className="tracker-header">
                <div className="tracker-title-row">
                    <span className="tracker-eye-icon">👁</span>
                    <h2 className="tracker-title">Whale Tracker</h2>
                </div>
                <p className="tracker-subtitle">
                    Get alerted in real-time when a watched wallet sends or receives large amounts.
                </p>
                <div className="tracker-slots">
                    <span className={`tracker-slot-badge ${atLimit ? "tracker-slot-badge--full" : ""}`}>
                        {slotsUsed} / {slotsTotal} wallets
                    </span>
                    {atLimit && limit === 3 && (
                        <span className="tracker-upgrade-hint">
                            Upgrade to Whale Tracker for 20 slots
                        </span>
                    )}
                </div>
            </div>

            {/* ── Add wallet form ── */}
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

            {/* ── Wallet list ── */}
            {loading ? (
                <div className="tracker-loading">
                    <div className="spinner" />
                </div>
            ) : error ? (
                <p className="tracker-error">{error}</p>
            ) : wallets.length === 0 ? (
                <div className="tracker-empty">
                    <p>No wallets watched yet.</p>
                    <p className="tracker-empty-hint">Add a whale's address above to start tracking.</p>
                </div>
            ) : (
                <ul className="tracker-wallet-list">
                    {wallets.map((w) => (
                        <li key={w.id} className="tracker-wallet-item">
                            <div className="tracker-wallet-info">
                                {w.label && (
                                    <span className="tracker-wallet-label">{w.label}</span>
                                )}
                                <span className="tracker-wallet-addr" title={w.walletAddress}>
                                    <span style={{ fontSize: "0.7rem", opacity: 0.6, marginRight: "4px" }}>
                                        {CHAIN_LABELS[w.chain] ?? w.chain}
                                    </span>
                                    {shortAddr(w.walletAddress)}
                                </span>
                            </div>
                            <button
                                className="tracker-remove-btn"
                                onClick={() => handleRemove(w.walletAddress)}
                                title="Stop watching"
                                aria-label={`Remove ${w.label ?? w.walletAddress}`}
                            >
                                ✕
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* ── Alert threshold note ── */}
            <p className="tracker-footer-note">
                🔔 Alerts fire via Telegram (≥ 10 SOL, or ≥ 1 ETH/native EVM token)
            </p>
        </div>
    );
}
