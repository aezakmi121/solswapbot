import { useState, useEffect, useCallback } from "react";
import {
    fetchAdminStats, fetchAdminUsers, fetchAdminReferrals, setUserTier,
    AdminStats, AdminUsersResponse, AdminReferralsResponse, SubTier
} from "../lib/api";
import { toast } from "../lib/toast";

const TIER_OPTIONS: { value: SubTier; label: string }[] = [
    { value: "FREE", label: "Free" },
    { value: "SCANNER_PRO", label: "Scanner Pro" },
    { value: "WHALE_TRACKER", label: "Whale Tracker" },
    { value: "ALL_ACCESS", label: "All Access" },
    { value: "SIGNALS", label: "Signals" },
];

const TIER_COLORS: Record<SubTier, string> = {
    FREE: "var(--text-muted)",
    SCANNER_PRO: "#22c55e",
    WHALE_TRACKER: "#3b82f6",
    SIGNALS: "#f59e0b",
    ALL_ACCESS: "#a855f7",
};

function TierBadge({ tier }: { tier: SubTier }) {
    if (tier === "FREE") return null;
    const label = TIER_OPTIONS.find(t => t.value === tier)?.label ?? tier;
    return (
        <span className="admin-tier-badge" style={{ background: TIER_COLORS[tier] }}>
            {label}
        </span>
    );
}

export function AdminPanel() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [usersData, setUsersData] = useState<AdminUsersResponse | null>(null);
    const [referralsData, setReferralsData] = useState<AdminReferralsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [activeSection, setActiveSection] = useState<"overview" | "users" | "referrals" | "tiers">("overview");

    // Tier management state
    const [tierMode, setTierMode] = useState<"single" | "bulk">("single");
    const [singleTgId, setSingleTgId] = useState("");
    const [bulkTgIds, setBulkTgIds] = useState("");
    const [selectedTier, setSelectedTier] = useState<SubTier>("ALL_ACCESS");
    const [tierLoading, setTierLoading] = useState(false);
    const [tierResult, setTierResult] = useState<{ updated: number; notFound: number; results: Array<{ telegramId: string; status: string }> } | null>(null);

    // Quick-set tier from user row
    const [quickSetUser, setQuickSetUser] = useState<string | null>(null);
    const [quickSetTier, setQuickSetTier] = useState<SubTier>("ALL_ACCESS");

    const loadData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError("");
        try {
            const [statsRes, usersRes, referralsRes] = await Promise.all([
                fetchAdminStats(),
                fetchAdminUsers(),
                fetchAdminReferrals(),
            ]);
            setStats(statsRes);
            setUsersData(usersRes);
            setReferralsData(referralsRes);
            setLastUpdated(new Date());
        } catch (err: any) {
            setError(err.message || "Failed to load admin data");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSetTier = async () => {
        const ids = tierMode === "single"
            ? [singleTgId.trim()]
            : bulkTgIds.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

        if (ids.length === 0 || (ids.length === 1 && !ids[0])) {
            toast("Enter at least one Telegram ID", "error");
            return;
        }

        setTierLoading(true);
        setTierResult(null);
        try {
            const result = await setUserTier(ids, selectedTier);
            setTierResult(result);
            toast(`Updated ${result.updated} user(s) to ${selectedTier}`, "success");
            // Refresh user list to reflect changes
            loadData(true);
        } catch (err: any) {
            toast(err.message || "Failed to set tier", "error");
        } finally {
            setTierLoading(false);
        }
    };

    const handleQuickSetTier = async (telegramId: string, tier: SubTier) => {
        try {
            await setUserTier([telegramId], tier);
            toast(`Set ${telegramId} to ${tier}`, "success");
            setQuickSetUser(null);
            loadData(true);
        } catch (err: any) {
            toast(err.message || "Failed to set tier", "error");
        }
    };

    if (loading) {
        return (
            <div className="admin-panel">
                <div className="admin-loading">
                    <div className="spinner" />
                    <p>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="admin-panel">
                <div className="admin-error">
                    <div className="admin-error-icon">&#9888;&#65039;</div>
                    <div className="admin-error-title">Access Denied</div>
                    <div className="admin-error-msg">{error}</div>
                    <button className="admin-retry-btn" onClick={() => loadData()}>Retry</button>
                </div>
            </div>
        );
    }

    if (!stats || !usersData) return null;

    const formatUsd = (val: number) =>
        "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatNum = (val: number) => val.toLocaleString("en-US");
    const timeAgo = lastUpdated
        ? `${Math.floor((Date.now() - lastUpdated.getTime()) / 1000)}s ago`
        : "";

    return (
        <div className="admin-panel">
            {/* Header */}
            <div className="admin-header">
                <div className="admin-header-left">
                    <h2 className="admin-title">Admin</h2>
                    <span className="admin-live-badge">
                        <span className="admin-live-dot" />
                        Live
                    </span>
                </div>
                <button
                    className="admin-refresh-btn"
                    onClick={() => loadData(true)}
                    disabled={refreshing}
                    title="Refresh data"
                >
                    {refreshing ? "..." : "\u21BB"}
                </button>
            </div>
            {lastUpdated && (
                <div className="admin-timestamp">Updated {timeAgo}</div>
            )}

            {/* Section Tabs */}
            <div className="admin-tabs">
                <button
                    className={`admin-tab${activeSection === "overview" ? " admin-tab--active" : ""}`}
                    onClick={() => setActiveSection("overview")}
                >Overview</button>
                <button
                    className={`admin-tab${activeSection === "users" ? " admin-tab--active" : ""}`}
                    onClick={() => setActiveSection("users")}
                >Users</button>
                <button
                    className={`admin-tab${activeSection === "tiers" ? " admin-tab--active" : ""}`}
                    onClick={() => setActiveSection("tiers")}
                >Tiers</button>
                <button
                    className={`admin-tab${activeSection === "referrals" ? " admin-tab--active" : ""}`}
                    onClick={() => setActiveSection("referrals")}
                >Referrals</button>
            </div>

            {/* ── OVERVIEW SECTION ── */}
            {activeSection === "overview" && (
                <div className="admin-section">
                    {/* KPI Grid */}
                    <div className="admin-kpi-grid">
                        <div className="admin-kpi-card">
                            <div className="admin-kpi-label">Total Users</div>
                            <div className="admin-kpi-value">{formatNum(stats.totalUsers)}</div>
                        </div>
                        <div className="admin-kpi-card">
                            <div className="admin-kpi-label">Confirmed Swaps</div>
                            <div className="admin-kpi-value">{formatNum(stats.totalSwaps)}</div>
                        </div>
                    </div>

                    {/* Revenue Card */}
                    <div className="admin-revenue-card">
                        <div className="admin-revenue-label">Protocol Revenue (All-time)</div>
                        <div className="admin-revenue-value">{formatUsd(stats.totalFeesUsd)}</div>
                    </div>

                    {/* Revenue Velocity */}
                    <div className="admin-divider">
                        <span className="admin-divider-text">Revenue Velocity</span>
                    </div>

                    <div className="admin-velocity-grid">
                        <div className="admin-velocity-card">
                            <div className="admin-velocity-period">24h</div>
                            <div className="admin-velocity-amount">{formatUsd(stats.feesToday.totalUsd)}</div>
                            <div className="admin-velocity-swaps">{stats.feesToday.swapCount} swaps</div>
                        </div>
                        <div className="admin-velocity-card">
                            <div className="admin-velocity-period">7d</div>
                            <div className="admin-velocity-amount">{formatUsd(stats.fees7d.totalUsd)}</div>
                            <div className="admin-velocity-swaps">{stats.fees7d.swapCount} swaps</div>
                        </div>
                        <div className="admin-velocity-card admin-velocity-card--wide">
                            <div className="admin-velocity-period">30d</div>
                            <div className="admin-velocity-amount">{formatUsd(stats.fees30d.totalUsd)}</div>
                            <div className="admin-velocity-swaps">{stats.fees30d.swapCount} swaps</div>
                        </div>
                    </div>

                    {/* Top Fee Generators */}
                    {usersData.topFeeGenerators && usersData.topFeeGenerators.length > 0 && (
                        <>
                            <div className="admin-divider">
                                <span className="admin-divider-text admin-divider-text--gold">Top Fee Generators</span>
                            </div>
                            <div className="admin-whale-list">
                                {usersData.topFeeGenerators.slice(0, 10).map((u, i) => (
                                    <div key={u.userId} className="admin-whale-row">
                                        <div className="admin-whale-rank">#{i + 1}</div>
                                        <div className="admin-whale-info">
                                            <div className="admin-whale-name">
                                                {u.telegramUsername ? `@${u.telegramUsername}` : `User ${u.telegramId?.slice(0, 8) || u.userId.slice(0, 8)}...`}
                                            </div>
                                            <div className="admin-whale-swaps">{u.swapCount || u.swaps} swaps</div>
                                        </div>
                                        <div className="admin-whale-fees">{formatUsd(u.totalFeeUsd || u.totalFeesUsd || 0)}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── USERS SECTION ── */}
            {activeSection === "users" && (
                <div className="admin-section">
                    <div className="admin-section-header">
                        <span className="admin-section-count">{formatNum(usersData.totalUsers)} total users</span>
                    </div>

                    {usersData.users.length === 0 ? (
                        <div className="admin-empty">No users yet</div>
                    ) : (
                        <div className="admin-user-list">
                            {usersData.users.map((u) => (
                                <div key={u.telegramId} className="admin-user-row">
                                    <div className="admin-user-avatar">
                                        {u.telegramUsername?.charAt(0).toUpperCase() || "U"}
                                    </div>
                                    <div className="admin-user-info">
                                        <div className="admin-user-name">
                                            {u.telegramUsername ? `@${u.telegramUsername}` : `User ${u.telegramId.slice(0, 8)}...`}
                                            <TierBadge tier={u.tier} />
                                        </div>
                                        <div className="admin-user-wallet">
                                            {u.walletAddress || "No wallet"}
                                            {u.hasEvmWallet && " \u00B7 EVM"}
                                        </div>
                                    </div>
                                    <div className="admin-user-right">
                                        <div className="admin-user-stats">
                                            <div className="admin-user-stat">
                                                <span className="admin-user-stat-num">{u.swapCount}</span>
                                                <span className="admin-user-stat-label">Swaps</span>
                                            </div>
                                            <div className="admin-user-stat">
                                                <span className="admin-user-stat-num">{u.sendCount}</span>
                                                <span className="admin-user-stat-label">Sends</span>
                                            </div>
                                            <div className="admin-user-stat">
                                                <span className="admin-user-stat-num">{u.scanCount}</span>
                                                <span className="admin-user-stat-label">Scans</span>
                                            </div>
                                            <div className="admin-user-stat">
                                                <span className="admin-user-stat-num">{u.referralCount}</span>
                                                <span className="admin-user-stat-label">Refs</span>
                                            </div>
                                        </div>
                                        {/* Quick tier toggle */}
                                        {quickSetUser === u.telegramId ? (
                                            <div className="admin-user-tier-picker">
                                                <select
                                                    value={quickSetTier}
                                                    onChange={(e) => setQuickSetTier(e.target.value as SubTier)}
                                                    className="admin-tier-select"
                                                >
                                                    {TIER_OPTIONS.map(t => (
                                                        <option key={t.value} value={t.value}>{t.label}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    className="admin-tier-apply-btn"
                                                    onClick={() => handleQuickSetTier(u.telegramId, quickSetTier)}
                                                >Set</button>
                                                <button
                                                    className="admin-tier-cancel-btn"
                                                    onClick={() => setQuickSetUser(null)}
                                                >&times;</button>
                                            </div>
                                        ) : (
                                            <button
                                                className="admin-user-tier-btn"
                                                onClick={() => { setQuickSetUser(u.telegramId); setQuickSetTier(u.tier); }}
                                                title="Change tier"
                                            >
                                                Tier
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TIERS SECTION ── */}
            {activeSection === "tiers" && (
                <div className="admin-section">
                    <div className="admin-tier-header">
                        <h3 className="admin-tier-title">Manage Subscriptions</h3>
                        <p className="admin-tier-subtitle">Set tier for single user or bulk upload Telegram IDs</p>
                    </div>

                    {/* Mode toggle */}
                    <div className="admin-tier-mode-toggle">
                        <button
                            className={`admin-tier-mode-btn${tierMode === "single" ? " admin-tier-mode-btn--active" : ""}`}
                            onClick={() => setTierMode("single")}
                        >Single User</button>
                        <button
                            className={`admin-tier-mode-btn${tierMode === "bulk" ? " admin-tier-mode-btn--active" : ""}`}
                            onClick={() => setTierMode("bulk")}
                        >Bulk</button>
                    </div>

                    {/* Input area */}
                    <div className="admin-tier-form">
                        {tierMode === "single" ? (
                            <input
                                type="text"
                                className="admin-tier-input"
                                placeholder="Telegram ID (e.g. 123456789)"
                                value={singleTgId}
                                onChange={(e) => setSingleTgId(e.target.value)}
                            />
                        ) : (
                            <textarea
                                className="admin-tier-textarea"
                                placeholder={"Paste Telegram IDs\nOne per line, or comma-separated\n\n123456789\n987654321\n111222333"}
                                value={bulkTgIds}
                                onChange={(e) => setBulkTgIds(e.target.value)}
                                rows={6}
                            />
                        )}

                        {/* Tier selector */}
                        <div className="admin-tier-selector">
                            <span className="admin-tier-selector-label">Set to:</span>
                            <div className="admin-tier-chips">
                                {TIER_OPTIONS.map(t => (
                                    <button
                                        key={t.value}
                                        className={`admin-tier-chip${selectedTier === t.value ? " admin-tier-chip--active" : ""}`}
                                        style={selectedTier === t.value ? { background: TIER_COLORS[t.value], borderColor: TIER_COLORS[t.value] } : {}}
                                        onClick={() => setSelectedTier(t.value)}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Count preview for bulk */}
                        {tierMode === "bulk" && bulkTgIds.trim() && (
                            <div className="admin-tier-count">
                                {bulkTgIds.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length} ID(s) entered
                            </div>
                        )}

                        <button
                            className="admin-tier-submit"
                            onClick={handleSetTier}
                            disabled={tierLoading}
                        >
                            {tierLoading ? "Applying..." : `Apply ${selectedTier.replace("_", " ")} Tier`}
                        </button>
                    </div>

                    {/* Results */}
                    {tierResult && (
                        <div className="admin-tier-results">
                            <div className="admin-tier-results-header">
                                <span className="admin-tier-results-ok">{tierResult.updated} updated</span>
                                {tierResult.notFound > 0 && (
                                    <span className="admin-tier-results-fail">{tierResult.notFound} not found</span>
                                )}
                            </div>
                            {tierResult.results.length <= 20 && (
                                <div className="admin-tier-results-list">
                                    {tierResult.results.map((r, i) => (
                                        <div key={i} className={`admin-tier-result-row ${r.status === "not_found" ? "admin-tier-result-row--fail" : ""}`}>
                                            <span className="admin-tier-result-id">{r.telegramId}</span>
                                            <span className="admin-tier-result-status">
                                                {r.status === "not_found" ? "Not found" : "Done"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tier summary */}
                    <div className="admin-divider">
                        <span className="admin-divider-text">Current Tier Distribution</span>
                    </div>
                    <div className="admin-tier-dist">
                        {(() => {
                            const counts: Record<string, number> = {};
                            usersData.users.forEach(u => {
                                counts[u.tier] = (counts[u.tier] || 0) + 1;
                            });
                            return TIER_OPTIONS.map(t => (
                                <div key={t.value} className="admin-tier-dist-row">
                                    <span className="admin-tier-dist-dot" style={{ background: TIER_COLORS[t.value] }} />
                                    <span className="admin-tier-dist-label">{t.label}</span>
                                    <span className="admin-tier-dist-count">{counts[t.value] || 0}</span>
                                </div>
                            ));
                        })()}
                    </div>
                </div>
            )}

            {/* ── REFERRALS SECTION ── */}
            {activeSection === "referrals" && (
                <div className="admin-section">
                    {referralsData ? (
                        <>
                            {/* Referral KPIs */}
                            <div className="admin-kpi-grid">
                                <div className="admin-kpi-card">
                                    <div className="admin-kpi-label">Total Referrals</div>
                                    <div className="admin-kpi-value">{formatNum(referralsData.totalReferrals)}</div>
                                </div>
                                <div className="admin-kpi-card">
                                    <div className="admin-kpi-label">Fee Share</div>
                                    <div className="admin-kpi-value">{referralsData.feeSharePercent}%</div>
                                </div>
                            </div>

                            <div className="admin-referral-note">
                                Referral payouts are display-only. No automatic fund distribution is implemented yet.
                            </div>

                            {/* Top Referrers */}
                            <div className="admin-divider">
                                <span className="admin-divider-text">Top Referrers</span>
                            </div>

                            {referralsData.topReferrers.length === 0 ? (
                                <div className="admin-empty">No referrers yet</div>
                            ) : (
                                <div className="admin-referrer-list">
                                    {referralsData.topReferrers.map((r, i) => (
                                        <div key={r.telegramId} className="admin-referrer-row">
                                            <div className="admin-referrer-rank">#{i + 1}</div>
                                            <div className="admin-referrer-info">
                                                <div className="admin-referrer-name">
                                                    {r.telegramUsername ? `@${r.telegramUsername}` : `User ${r.telegramId.slice(0, 8)}...`}
                                                </div>
                                                <div className="admin-referrer-count">{r.referralCount} referrals</div>
                                            </div>
                                            <div className="admin-referrer-earnings">{formatUsd(r.earningsUsd)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="admin-empty">Failed to load referral data</div>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="admin-footer">
                Secured by Privy MPC &middot; HMAC Auth
            </div>
        </div>
    );
}
