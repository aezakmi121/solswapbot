import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Copy, Check } from "lucide-react";
import { fetchPortfolio, fetchActivity, Portfolio, PortfolioToken, ActivityItem } from "../lib/api";
import { ReceiveModal } from "./ReceiveModal";
import { SendFlow } from "./SendFlow";
import { toast } from "../lib/toast";

const PULL_THRESHOLD = 72; // px of downward drag needed to trigger refresh

interface WalletTabProps {
    walletAddress: string;
    solBalance: number | null;
    onNavigateToSwap: () => void;
}

function formatUsd(v: number): string {
    if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    return `$${v.toFixed(2)}`;
}

function formatAmount(amount: number, decimals: number): string {
    if (amount === 0) return "0";
    if (amount < 0.001) return amount.toPrecision(2);
    const maxDecimals = Math.min(decimals, amount < 1 ? 6 : 4);
    return amount.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

function ActivityRow({ item }: { item: ActivityItem }) {
    const isConfirmed = item.status === "CONFIRMED";
    const statusIcon = isConfirmed ? "✅" : item.status === "FAILED" ? "❌" : "⏳";

    if (item.type === "swap") {
        return (
            <div className="activity-row">
                <span className="activity-type-icon"><ArrowRightLeft size={16} /></span>
                <div className="activity-info">
                    <span className="activity-desc">{item.inputSymbol} → {item.outputSymbol}</span>
                    <span className="activity-time">{timeAgo(item.createdAt)}</span>
                </div>
                <div className="activity-right">
                    <span className="activity-status">{statusIcon}</span>
                    {item.txSignature && (
                        <a
                            className="activity-link"
                            href={`https://solscan.io/tx/${item.txSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >↗</a>
                    )}
                </div>
            </div>
        );
    }

    const isReceive = item.type === "receive";

    return (
        <div className="activity-row">
            <span className="activity-type-icon">{isReceive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
            <div className="activity-info">
                <span className="activity-desc">
                    {isReceive ? "Received" : "Sent"} {item.humanAmount} {item.tokenSymbol}
                </span>
                <span className="activity-time">
                    {isReceive && item.senderAddress
                        ? `from ${item.senderAddress.slice(0, 4)}...${item.senderAddress.slice(-4)} · `
                        : !isReceive
                        ? `${item.recipientAddress.slice(0, 4)}...${item.recipientAddress.slice(-4)} · `
                        : ""
                    }{timeAgo(item.createdAt)}
                </span>
            </div>
            <div className="activity-right">
                <span className="activity-status">{statusIcon}</span>
                {item.txSignature && (
                    <a
                        className="activity-link"
                        href={`https://solscan.io/tx/${item.txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >↗</a>
                )}
            </div>
        </div>
    );
}

/** Emoji badge for each supported chain */
const CHAIN_BADGE: Record<string, string> = {
    solana:   "🟣",
    ethereum: "🔷",
    bsc:      "🟡",
    polygon:  "🟪",
    arbitrum: "🔵",
    base:     "🔵",
};

function TokenRow({ token }: { token: PortfolioToken }) {
    const [iconError, setIconError] = useState(false);
    const chainBadge = CHAIN_BADGE[token.chain] ?? null;

    return (
        <div className="portfolio-token-row">
            <div className="portfolio-token-icon-wrap">
                {token.icon && !iconError ? (
                    <img
                        className="portfolio-token-icon"
                        src={token.icon}
                        alt={token.symbol}
                        onError={() => setIconError(true)}
                    />
                ) : (
                    <div className="portfolio-token-icon-placeholder">
                        {token.symbol.slice(0, 2)}
                    </div>
                )}
            </div>
            <div className="portfolio-token-info">
                <span className="portfolio-token-symbol">
                    {token.symbol}
                    {chainBadge && <span className="portfolio-chain-badge">{chainBadge}</span>}
                </span>
                <span className="portfolio-token-name">{token.name}</span>
            </div>
            <div className="portfolio-token-values">
                <span className="portfolio-token-amount">
                    {formatAmount(token.amount, token.decimals)}
                </span>
                {token.valueUsd !== null ? (
                    <span className="portfolio-token-usd">{formatUsd(token.valueUsd)}</span>
                ) : (
                    <span className="portfolio-token-usd portfolio-token-usd--unknown">—</span>
                )}
            </div>
        </div>
    );
}

export function WalletTab({ walletAddress, solBalance, onNavigateToSwap }: WalletTabProps) {
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showReceive, setShowReceive] = useState(false);
    const [showSend, setShowSend] = useState(false);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [activityLoading, setActivityLoading] = useState(true);
    const [showAllActivity, setShowAllActivity] = useState(false);

    // ── Pull-to-refresh state ──
    const [ptrState, setPtrState] = useState<"idle" | "pulling" | "refreshing">("idle");
    const [pullY, setPullY] = useState(0); // 0..1 progress
    const touchStartY = useRef(0);
    const isPulling = useRef(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const loadPortfolio = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchPortfolio();
            setPortfolio(data);
        } catch (err) {
            setError("Failed to load portfolio");
            console.error("Portfolio load error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadActivity = useCallback(async () => {
        setActivityLoading(true);
        try {
            const data = await fetchActivity();
            setActivity(data);
        } catch (err) {
            console.error("Activity load error:", err);
        } finally {
            setActivityLoading(false);
        }
    }, []);

    const refreshAll = useCallback(async () => {
        await Promise.all([loadPortfolio(), loadActivity()]);
    }, [loadPortfolio, loadActivity]);

    useEffect(() => {
        loadPortfolio();
        loadActivity();
    }, [walletAddress, loadPortfolio, loadActivity]);

    // ── Pull-to-refresh touch handlers ──
    const getScrollParent = (): HTMLElement | null =>
        rootRef.current?.closest(".tab-content") as HTMLElement | null;

    const handleTouchStart = (e: React.TouchEvent) => {
        const scrollParent = getScrollParent();
        if (scrollParent && scrollParent.scrollTop > 0) return; // Only allow from top
        touchStartY.current = e.touches[0].clientY;
        isPulling.current = true;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPulling.current || ptrState === "refreshing") return;
        const scrollParent = getScrollParent();
        if (scrollParent && scrollParent.scrollTop > 0) {
            isPulling.current = false;
            return;
        }
        const delta = e.touches[0].clientY - touchStartY.current;
        if (delta > 0) {
            const progress = Math.min(delta / PULL_THRESHOLD, 1);
            setPullY(progress);
            setPtrState("pulling");
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling.current) return;
        isPulling.current = false;
        if (pullY >= 1 && ptrState !== "refreshing") {
            setPtrState("refreshing");
            setPullY(0);
            await refreshAll();
            setPtrState("idle");
        } else {
            setPullY(0);
            setPtrState("idle");
        }
    };

    const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const [addrCopied, setAddrCopied] = useState(false);
    const handleCopyAddr = () => {
        navigator.clipboard.writeText(walletAddress).then(() => {
            setAddrCopied(true);
            setTimeout(() => setAddrCopied(false), 2000);
            toast("Address copied!");
        }).catch(() => {});
    };

    return (
        <div
            className="wallet-tab"
            ref={rootRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* ── Pull-to-refresh indicator ── */}
            {(ptrState === "pulling" || ptrState === "refreshing") && (
                <div
                    className="ptr-indicator"
                    style={{ opacity: ptrState === "refreshing" ? 1 : pullY }}
                >
                    <div className={`ptr-spinner${ptrState === "refreshing" ? " ptr-spinner--spinning" : ""}`}
                        style={{ transform: ptrState === "pulling" ? `rotate(${pullY * 360}deg)` : undefined }}
                    />
                    <span className="ptr-label">
                        {ptrState === "refreshing" ? "Refreshing..." : pullY >= 1 ? "Release to refresh" : "Pull to refresh"}
                    </span>
                </div>
            )}

            {/* ── Portfolio Value ── */}
            <div className="portfolio-header">
                {loading ? (
                    <div className="portfolio-value-loading">
                        <div className="skeleton skeleton-value" />
                    </div>
                ) : (
                    <div className="portfolio-total">
                        {portfolio
                            ? formatUsd(portfolio.totalValueUsd)
                            : solBalance !== null
                                ? formatUsd(solBalance * 0)
                                : "$—"}
                    </div>
                )}
                <div className="portfolio-address-row">
                    <span className="portfolio-address">{shortAddr(walletAddress)}</span>
                    <button className="portfolio-copy-btn" onClick={handleCopyAddr} title="Copy address">
                        {addrCopied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                </div>
            </div>

            {/* ── Action Buttons ── */}
            <div className="wallet-actions">
                <button className="wallet-action-btn" onClick={() => setShowReceive(true)}>
                    <span className="wallet-action-circle">
                        <span className="wallet-action-icon"><ArrowDownLeft size={24} /></span>
                    </span>
                    <span className="wallet-action-label">Receive</span>
                </button>
                <button className="wallet-action-btn" onClick={() => setShowSend(true)}>
                    <span className="wallet-action-circle">
                        <span className="wallet-action-icon"><ArrowUpRight size={24} /></span>
                    </span>
                    <span className="wallet-action-label">Send</span>
                </button>
                <button className="wallet-action-btn" onClick={onNavigateToSwap}>
                    <span className="wallet-action-circle">
                        <span className="wallet-action-icon"><ArrowRightLeft size={24} /></span>
                    </span>
                    <span className="wallet-action-label">Swap</span>
                </button>
            </div>

            {/* ── Token List ── */}
            <div className="portfolio-section">
                <div className="portfolio-section-header">
                    <h3>Your Tokens</h3>
                    <button className="portfolio-refresh-btn" onClick={loadPortfolio} disabled={loading}>
                        {loading ? "..." : "↻"}
                    </button>
                </div>

                {loading ? (
                    <div className="portfolio-skeleton">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="portfolio-token-row">
                                <div className="skeleton skeleton-icon" />
                                <div className="portfolio-token-info">
                                    <div className="skeleton skeleton-text-sm" />
                                    <div className="skeleton skeleton-text-xs" />
                                </div>
                                <div className="portfolio-token-values">
                                    <div className="skeleton skeleton-text-sm" />
                                    <div className="skeleton skeleton-text-xs" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="portfolio-error">
                        <p>{error}</p>
                        <button className="reset-btn" onClick={loadPortfolio}>Retry</button>
                    </div>
                ) : portfolio && portfolio.tokens.length > 0 ? (
                    <div className="portfolio-token-list">
                        {portfolio.tokens.map((token) => (
                            <TokenRow key={token.mint} token={token} />
                        ))}
                    </div>
                ) : (
                    <div className="portfolio-empty">
                        <p>No tokens yet.</p>
                        <p className="portfolio-empty-hint">Receive SOL to get started.</p>
                    </div>
                )}
            </div>

            {/* ── Recent Activity ── */}
            <div className="portfolio-section">
                <div className="portfolio-section-header">
                    <h3>Recent Activity</h3>
                    {!activityLoading && activity.length > 5 && (
                        <button
                            className="activity-view-all"
                            onClick={() => setShowAllActivity((v) => !v)}
                        >
                            {showAllActivity ? "Show less" : `View all (${activity.length})`}
                        </button>
                    )}
                </div>

                {activityLoading ? (
                    <div className="portfolio-skeleton">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="activity-row">
                                <div className="skeleton skeleton-icon" />
                                <div className="portfolio-token-info">
                                    <div className="skeleton skeleton-text-sm" />
                                    <div className="skeleton skeleton-text-xs" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : activity.length === 0 ? (
                    <div className="portfolio-empty">
                        <p>No transactions yet.</p>
                    </div>
                ) : (
                    <div className="activity-list">
                        {(showAllActivity ? activity : activity.slice(0, 5)).map((item) => (
                            <ActivityRow key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Receive Modal ── */}
            {showReceive && (
                <ReceiveModal
                    walletAddress={walletAddress}
                    onClose={() => setShowReceive(false)}
                />
            )}

            {/* ── Send Flow ── */}
            {showSend && (
                <SendFlow
                    portfolioTokens={portfolio?.tokens ?? []}
                    walletAddress={walletAddress}
                    onClose={() => setShowSend(false)}
                    onSent={loadPortfolio}
                />
            )}
        </div>
    );
}
