import { useState } from "react";
import { fetchTokenScan, ScanResult } from "../lib/api";
import { RiskGauge } from "./RiskGauge";
import { toast } from "../lib/toast";

interface ScanPanelProps {
    onNavigateToSwap?: (mint?: string) => void;
}

interface RecentScan {
    mint: string;
    symbol: string | null;
    score: number;
    level: string;
    ts: number;
}

const RECENT_KEY = "solswap_recent_scans";

function loadRecent(): RecentScan[] {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

function saveRecent(scan: RecentScan) {
    const existing = loadRecent().filter((s) => s.mint !== scan.mint);
    localStorage.setItem(RECENT_KEY, JSON.stringify([scan, ...existing].slice(0, 5)));
}

function formatSupply(supply: string | null): string {
    if (!supply) return "—";
    const n = Number(supply);
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    return n.toLocaleString();
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ScanPanel({ onNavigateToSwap }: ScanPanelProps) {
    const [mint, setMint] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ScanResult | null>(null);
    const [error, setError] = useState("");
    const [recentScans, setRecentScans] = useState<RecentScan[]>(loadRecent);

    const handleScan = async (addr?: string) => {
        const target = (addr ?? mint).trim();
        if (!target) return;
        setMint(target);
        setLoading(true);
        setError("");
        setResult(null);
        try {
            const data = await fetchTokenScan(target);
            setResult(data);
            saveRecent({
                mint: data.mintAddress,
                symbol: data.tokenInfo.symbol,
                score: data.riskScore,
                level: data.riskLevel,
                ts: Date.now(),
            });
            setRecentScans(loadRecent());
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to scan token";
            setError(msg);
            toast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="scan-panel">

            {/* ── Input ── */}
            <div className="scan-input-row">
                <div className="scan-input-wrap">
                    <input
                        className="scan-input"
                        type="text"
                        placeholder="Paste token mint address..."
                        value={mint}
                        onChange={(e) => setMint(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleScan()}
                    />
                    {mint && (
                        <button className="scan-clear-btn" onClick={() => setMint("")} title="Clear">✕</button>
                    )}
                    <button
                        className="scan-paste-btn"
                        title="Paste from clipboard"
                        onClick={async () => {
                            const text = await navigator.clipboard.readText().catch(() => "");
                            if (text.trim()) setMint(text.trim());
                        }}
                    >
                        📋
                    </button>
                </div>
                <button
                    className="swap-btn scan-submit-btn"
                    onClick={() => handleScan()}
                    disabled={loading || !mint.trim()}
                >
                    {loading ? (
                        <><span className="btn-spinner" /> Scanning...</>
                    ) : (
                        "🔍 Scan Token"
                    )}
                </button>
            </div>

            {error && <div className="scan-error">{error}</div>}

            {/* ── Results ── */}
            {result && (
                <div className="scan-result">
                    {/* Gauge with token identity */}
                    <RiskGauge
                        score={result.riskScore}
                        level={result.riskLevel}
                        tokenName={result.tokenInfo.name}
                        tokenSymbol={result.tokenInfo.symbol}
                        tokenIcon={result.tokenInfo.icon}
                    />

                    {/* Mint address (always shown below gauge) */}
                    <div className="scan-mint-addr">
                        {result.mintAddress.slice(0, 8)}...{result.mintAddress.slice(-6)}
                    </div>

                    {/* Checks */}
                    <div className="scan-section">
                        <div className="scan-section-title">Safety Checks</div>
                        {result.checks.map((check, i) => (
                            <div key={i} className="scan-check-row">
                                <span className={`scan-check-icon ${check.safe ? "scan-check-safe" : "scan-check-warn"}`}>
                                    {check.safe ? "✅" : "⚠️"}
                                </span>
                                <span className="scan-check-name">{check.name}</span>
                                <span className="scan-check-detail">{check.detail}</span>
                            </div>
                        ))}
                    </div>

                    {/* Token Info */}
                    {(result.tokenInfo.supply || result.tokenInfo.price !== null || result.tokenInfo.decimals !== null) && (
                        <div className="scan-section">
                            <div className="scan-section-title">Token Info</div>
                            {result.tokenInfo.supply && (
                                <div className="scan-info-row">
                                    <span className="scan-info-label">Supply</span>
                                    <span className="scan-info-value">{formatSupply(result.tokenInfo.supply)}</span>
                                </div>
                            )}
                            {result.tokenInfo.price !== null && (
                                <div className="scan-info-row">
                                    <span className="scan-info-label">Price</span>
                                    <span className="scan-info-value">${result.tokenInfo.price.toPrecision(4)}</span>
                                </div>
                            )}
                            {result.tokenInfo.decimals !== null && (
                                <div className="scan-info-row">
                                    <span className="scan-info-label">Decimals</span>
                                    <span className="scan-info-value">{result.tokenInfo.decimals}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Swap action */}
                    {onNavigateToSwap && (
                        <button
                            className="scan-swap-btn swap-btn"
                            onClick={() => onNavigateToSwap(result.mintAddress)}
                        >
                            🔄 Swap This Token
                        </button>
                    )}

                    {/* Disclaimer */}
                    <div className="scan-disclaimer">
                        <span className="scan-disclaimer-icon">⚠️</span>
                        <div className="scan-disclaimer-text">
                            <strong>Disclaimer:</strong> Results are based on automated on-chain data only.
                            This scanner cannot detect team malice, off-chain agreements, social engineering,
                            or future actions. A <strong>LOW RISK</strong> score is not an endorsement or
                            guarantee of safety. Always do your own research. Never invest more than you
                            can afford to lose. SolSwap is not liable for losses on tokens rated safe.
                        </div>
                    </div>
                </div>
            )}

            {/* ── Recent Scans ── */}
            {recentScans.length > 0 && !result && !loading && (
                <div className="scan-recent">
                    <div className="scan-section-title">Recent Scans</div>
                    {recentScans.map((s) => (
                        <button
                            key={s.mint}
                            className="scan-recent-row"
                            onClick={() => handleScan(s.mint)}
                        >
                            <span className={`scan-recent-level scan-recent-level--${s.level.toLowerCase()}`}>
                                {s.level}
                            </span>
                            <span className="scan-recent-score">{s.score}</span>
                            <span className="scan-recent-addr">
                                {s.symbol ? s.symbol : `${s.mint.slice(0, 6)}...`}
                            </span>
                            <span className="scan-recent-time">{timeAgo(s.ts)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
