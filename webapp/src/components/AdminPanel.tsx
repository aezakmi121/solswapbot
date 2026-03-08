import { useState, useEffect, useCallback } from "react";
import { fetchAdminStats, fetchAdminUsers, fetchAdminReferrals, AdminStats, AdminUsersResponse, AdminReferralsResponse } from "../lib/api";

export function AdminPanel() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [usersData, setUsersData] = useState<AdminUsersResponse | null>(null);
    const [referralsData, setReferralsData] = useState<AdminReferralsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [activeSection, setActiveSection] = useState<"overview" | "users" | "referrals">("overview");

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
                    <div className="admin-error-icon">⚠️</div>
                    <div className="admin-error-title">Access Denied</div>
                    <div className="admin-error-msg">{error}</div>
                    <button className="admin-retry-btn" onClick={() => loadData()}>Retry</button>
                </div>
            </div>
        );
    }

    if (!stats || !usersData) return null;

    const formatUsd = (val: number) =>
        "$" + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatNum = (val: number) => val.toLocaleString();
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
                    {refreshing ? "..." : "↻"}
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
                                        </div>
                                        <div className="admin-user-wallet">
                                            {u.walletAddress || "No wallet"}
                                            {u.hasEvmWallet && " · EVM"}
                                        </div>
                                    </div>
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
                                </div>
                            ))}
                        </div>
                    )}
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
