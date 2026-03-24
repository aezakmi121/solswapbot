import { useState } from "react";
import { Search, Copy, CheckCircle2, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { fetchTokenScan, ScanResult } from "../lib/api";
import { RiskGauge } from "./RiskGauge";
import { UpgradeModal } from "./UpgradeModal";
import { toast } from "../lib/toast";

interface SwapTokenInfo {
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    icon: string;
}

interface ScanPanelProps {
    onNavigateToSwap?: (token?: SwapTokenInfo) => void;
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

const CHAIN_LABELS: Record<string, string> = {
    solana: "Solana",
    ethereum: "Ethereum",
    bsc: "BNB Chain",
    polygon: "Polygon",
    arbitrum: "Arbitrum",
    base: "Base",
};

const CHAIN_EMOJI: Record<string, string> = {
    solana: "🟣",
    ethereum: "🔷",
    bsc: "🟡",
    polygon: "🟪",
    arbitrum: "🔵",
    base: "🔵",
};

const EVM_CHAINS = ["ethereum", "bsc", "polygon", "arbitrum", "base"];

function isEvmAddress(addr: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

const CHECK_INFO: Record<string, string> = {
    // Solana checks
    "Mint Authority": "If enabled, the token creator can mint unlimited new tokens at any time, diluting your holdings and crashing the price.",
    "Freeze Authority": "If enabled, the token creator can freeze your token balance, preventing you from selling or transferring.",
    "Top Holders": "Shows how concentrated token ownership is. High concentration means a few wallets can dump and crash the price.",
    "Token Metadata": "Legitimate tokens have a registered name and symbol. Missing metadata is common with hastily-created scam tokens.",
    "Jupiter Verified": "Jupiter maintains a curated list of vetted tokens. Unverified tokens haven't passed their review process.",
    "Token Age": "Very new tokens (under 24 hours) are higher risk. Most rug pulls happen within the first few hours of launch.",
    "Liquidity Pool": "Liquidity pools let you buy and sell a token. If no pool exists or liquidity was drained, the token may be unsellable.",
    "Honeypot Detection": "We simulate selling this token. If no sell route exists, the token may be a honeypot — you can buy but can never sell.",
    "Metadata Mutability": "If metadata is mutable, the creator can change the token's name, symbol, and image after launch — potentially impersonating legitimate tokens to trick buyers.",
    "Creator Holdings": "Shows what percentage of the total supply the token deployer still holds. Large creator holdings (>10%) mean they could dump their tokens and crash the price at any time.",
    "Update Authority": "The update authority controls who can modify the token's on-chain metadata. It should be revoked for maximum safety. If active, the creator can rename or rebrand the token.",
    "Transfer Fee": "Some tokens have a built-in transfer fee that takes a percentage on every transfer. This is a hidden tax most buyers don't expect.",
    // EVM checks
    "Owner Renounced": "If the contract owner hasn't renounced ownership, they can change contract settings, pause trading, or mint new tokens. Renounced ownership means no single entity controls the contract.",
    "Proxy Contract": "Upgradeable proxy contracts let the developer change the token's logic after deployment. The code you see today could be replaced with malicious code tomorrow.",
    "Contract Code": "We check if the address has smart contract code and if it's a reasonable size. No code or suspiciously small contracts are red flags.",
    "Mint Function": "If the contract has a public mint function and the owner hasn't renounced, new tokens can be created at any time — diluting your holdings.",
    "Transfer Tax": "Some contracts have built-in fees on every transfer (buy/sell tax). This hidden tax reduces your actual received amount on every trade.",
    "Liquidity": "We check if the token has a trading pair on major DEXs (Uniswap, PancakeSwap, etc.). No liquidity pair means you may not be able to sell.",
};

export function ScanPanel({ onNavigateToSwap }: ScanPanelProps) {
    const [mint, setMint] = useState("");
    const [evmChain, setEvmChain] = useState("ethereum");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ScanResult | null>(null);
    const [error, setError] = useState("");
    const [limitReached, setLimitReached] = useState(false);
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [recentScans, setRecentScans] = useState<RecentScan[]>(loadRecent);
    const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

    const inputIsEvm = isEvmAddress(mint.trim());

    const handleScan = async (addr?: string) => {
        const target = (addr ?? mint).trim();
        if (!target) return;
        setMint(target);
        setLoading(true);
        setError("");
        setLimitReached(false);
        setResult(null);
        setExpandedCheck(null);
        try {
            const chain = isEvmAddress(target) ? evmChain : undefined;
            const data = await fetchTokenScan(target, chain);
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
            // Detect scan limit (429) to show upgrade prompt
            if (msg.includes("limit") || msg.includes("Upgrade")) {
                setLimitReached(true);
            }
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
                        placeholder="Paste Solana or EVM (0x...) token address"
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
                        <Copy size={16} />
                    </button>
                </div>

                {/* EVM chain selector — shown when input looks like an EVM address */}
                {inputIsEvm && (
                    <div className="scan-chain-row">
                        <span className="scan-chain-label">Chain:</span>
                        <div className="scan-chain-chips">
                            {EVM_CHAINS.map((c) => (
                                <button
                                    key={c}
                                    className={`scan-chain-chip ${evmChain === c ? "active" : ""}`}
                                    onClick={() => setEvmChain(c)}
                                >
                                    {CHAIN_EMOJI[c]} {CHAIN_LABELS[c]}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    className="swap-btn scan-submit-btn"
                    onClick={() => handleScan()}
                    disabled={loading || !mint.trim()}
                >
                    {loading ? (
                        <><span className="btn-spinner" /> Scanning...</>
                    ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}><Search size={16} /> Scan Token</span>
                    )}
                </button>
            </div>

            {error && (
                <div className="scan-error">
                    {error}
                    {limitReached && (
                        <button className="scan-upgrade-btn" onClick={() => setShowUpgrade(true)}>
                            Upgrade to Scanner Pro
                        </button>
                    )}
                </div>
            )}

            <UpgradeModal
                open={showUpgrade}
                onClose={() => setShowUpgrade(false)}
                highlightTier="SCANNER_PRO"
            />

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

                    {/* Chain badge + mint address */}
                    <div className="scan-mint-addr">
                        {result.chain && (
                            <span className="scan-chain-badge">
                                {CHAIN_EMOJI[result.chain] ?? ""} {CHAIN_LABELS[result.chain] ?? result.chain}
                            </span>
                        )}
                        {result.mintAddress.slice(0, 8)}...{result.mintAddress.slice(-6)}
                    </div>

                    {/* Checks */}
                    <div className="scan-section">
                        <div className="scan-section-title">Safety Checks</div>
                        {result.checks.map((check, i) => (
                            <div key={i} className="scan-check-wrap">
                                <div className="scan-check-row">
                                    <span className={`scan-check-icon ${check.safe ? "scan-check-safe" : "scan-check-warn"}`}>
                                        {check.safe ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                    </span>
                                    <span className="scan-check-name">{check.name}</span>
                                    <span className="scan-check-detail">{check.detail}</span>
                                    {CHECK_INFO[check.name] && (
                                        <button
                                            className={`scan-check-info-btn${expandedCheck === check.name ? " scan-check-info-btn--active" : ""}`}
                                            onClick={() => setExpandedCheck(expandedCheck === check.name ? null : check.name)}
                                            title="What does this mean?"
                                        >
                                            i
                                        </button>
                                    )}
                                </div>
                                {expandedCheck === check.name && CHECK_INFO[check.name] && (
                                    <div className="scan-check-info">
                                        {CHECK_INFO[check.name]}
                                    </div>
                                )}
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

                    {/* Swap action (Solana only — EVM tokens can't be swapped inline yet) */}
                    {onNavigateToSwap && (!result.chain || result.chain === "solana") && (
                        <button
                            className="scan-swap-btn swap-btn"
                            onClick={() => onNavigateToSwap({
                                mint: result.mintAddress,
                                symbol: result.tokenInfo.symbol || result.mintAddress.slice(0, 6),
                                name: result.tokenInfo.name || "Unknown Token",
                                decimals: result.tokenInfo.decimals ?? 9,
                                icon: result.tokenInfo.icon || "",
                            })}
                        >
                            <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}><ArrowRightLeft size={16} /> Swap This Token</span>
                        </button>
                    )}

                    {/* Disclaimer */}
                    <div className="scan-disclaimer">
                        <span className="scan-disclaimer-icon"><AlertTriangle size={16} /></span>
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
