import { useState, useEffect } from "react";
import { fetchAdminStats, fetchAdminUsers, AdminStats, AdminUsersResponse } from "../lib/api";

export function AdminPanel() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [usersData, setUsersData] = useState<AdminUsersResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;
        
        async function loadData() {
            setLoading(true);
            setError("");
            try {
                const [statsRes, usersRes] = await Promise.all([
                    fetchAdminStats(),
                    fetchAdminUsers()
                ]);
                if (mounted) {
                    setStats(statsRes);
                    setUsersData(usersRes);
                }
            } catch (err: any) {
                if (mounted) setError(err.message || "Failed to load admin data");
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadData();
        return () => { mounted = false; };
    }, []);

    if (loading) {
        return (
            <div className="panel flex flex-col items-center justify-center p-8 space-y-4">
                <div className="animate-spin text-solana-purple text-2xl">⚡</div>
                <div className="text-gray-400 text-sm">Loading admin dashboard...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel flex flex-col items-center justify-center p-8">
                <div className="text-red-400 mb-2">Access Denied</div>
                <div className="text-gray-400 text-sm text-center">{error}</div>
            </div>
        );
    }

    if (!stats || !usersData) return null;

    const formatUsd = (val: number) => "$" + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatNum = (val: number) => val.toLocaleString();

    return (
        <div className="panel overflow-y-auto max-h-[calc(100vh-140px)] no-scrollbar">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-solana-purple">🛡️</span> Admin Dashboard
            </h2>

            {/* Total Metrics */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="settings-card !p-3">
                    <div className="text-xs text-gray-400 mb-1">Total Users</div>
                    <div className="text-lg font-bold">{formatNum(stats.totalUsers)}</div>
                </div>
                <div className="settings-card !p-3">
                    <div className="text-xs text-gray-400 mb-1">Total Swaps</div>
                    <div className="text-lg font-bold">{formatNum(stats.totalSwaps)}</div>
                </div>
                <div className="settings-card !p-3 col-span-2 border border-solana-green/20">
                    <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                        <span>Total Fees Earned</span>
                        <span className="text-solana-green text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-solana-green/10">All-time</span>
                    </div>
                    <div className="text-2xl font-bold text-solana-green">{formatUsd(stats.totalFeesUsd)}</div>
                </div>
            </div>

            {/* Fee Velocity */}
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Revenue Velocity</h3>
            <div className="grid grid-cols-2 gap-3 mb-6">
                 <div className="settings-card !p-3">
                    <div className="text-xs text-gray-400 mb-1">Last 24h</div>
                    <div className="text-base font-bold text-solana-green">{formatUsd(stats.feesToday.totalUsd)}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{stats.feesToday.swapCount} swaps</div>
                </div>
                <div className="settings-card !p-3">
                    <div className="text-xs text-gray-400 mb-1">Last 7 Days</div>
                    <div className="text-base font-bold text-solana-green">{formatUsd(stats.fees7d.totalUsd)}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{stats.fees7d.swapCount} swaps</div>
                </div>
                <div className="settings-card !p-3 col-span-2">
                    <div className="text-xs text-gray-400 mb-1">Last 30 Days</div>
                    <div className="text-base font-bold text-solana-green">{formatUsd(stats.fees30d.totalUsd)}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{stats.fees30d.swapCount} swaps</div>
                </div>
            </div>

            {/* Recent Users */}
            <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Latest Active Users</h3>
            <div className="space-y-2 mb-6">
                {usersData.users.length === 0 ? (
                    <div className="text-center text-sm text-gray-500 py-4">No users found</div>
                ) : (
                    usersData.users.slice(0, 10).map((u) => (
                        <div key={u.telegramId} className="settings-card !p-3 flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="font-semibold text-sm">
                                    {u.telegramUsername ? `@${u.telegramUsername}` : `User ${u.telegramId.slice(0,6)}...`}
                                </span>
                                <span className="text-[10px] text-gray-400 mt-0.5">
                                    {u.walletAddress ? `${u.walletAddress.slice(0, 4)}...${u.walletAddress.slice(-4)}` : "No wallet"}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex flex-col items-center bg-gray-800/50 rounded px-2 py-1">
                                    <span className="text-[10px] text-gray-500">Swaps</span>
                                    <span className="text-xs font-mono">{u.swapCount}</span>
                                </div>
                                <div className="flex flex-col items-center bg-gray-800/50 rounded px-2 py-1">
                                    <span className="text-[10px] text-gray-500">Refs</span>
                                    <span className="text-xs font-mono">{u.referralCount}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            {/* Top Fee Generators */}
            {usersData.topFeeGenerators && usersData.topFeeGenerators.length > 0 && (
                <>
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Top Whales</h3>
                    <div className="space-y-2 mb-4">
                        {usersData.topFeeGenerators.slice(0, 5).map((u, i) => (
                           <div key={u.userId} className="settings-card !p-3 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 text-center text-xs font-bold text-gray-500">#{i + 1}</div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-sm">User</span>
                                        <span className="text-[10px] text-gray-400">{u.swaps} swaps</span>
                                    </div>
                                </div>
                                <div className="text-sm font-bold text-solana-green">
                                    {formatUsd(u.totalFeeUsd)}
                                </div>
                            </div> 
                        ))}
                    </div>
                </>
            )}

            <div className="text-[10px] text-center text-gray-500 mt-6 pb-2">
                Data refreshed securely via admin token
            </div>
        </div>
    );
}
