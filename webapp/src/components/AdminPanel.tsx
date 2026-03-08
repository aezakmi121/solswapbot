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
        <div className="panel overflow-y-auto max-h-[calc(100vh-140px)] no-scrollbar relative z-0">
            {/* Background Glows */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-solana-purple/20 rounded-full blur-[60px] -z-10 pointer-events-none"></div>
            <div className="absolute bottom-40 left-0 w-40 h-40 bg-solana-green/10 rounded-full blur-[70px] -z-10 pointer-events-none"></div>
            
            <header className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                    <span className="text-solana-purple drop-shadow-[0_0_8px_rgba(124,92,252,0.6)] animate-pulse">🛡️</span> 
                    <span className="bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">Nexus Hub</span>
                </h2>
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-solana-green animate-pulse shadow-[0_0_5px_#4ade80]"></div>
                    <span className="text-[10px] text-solana-green uppercase font-bold tracking-widest">Live</span>
                </div>
            </header>

            {/* Total Metrics - Glass Cards */}
            <div className="grid grid-cols-2 gap-3 mb-8">
                <div className="relative overflow-hidden bg-[#242540]/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 transition-all hover:border-solana-purple/30 hover:bg-[#2a2b45]/80">
                    <div className="text-xs text-gray-400 mb-1 font-medium">Total Network Users</div>
                    <div className="text-xl font-bold text-white">{formatNum(stats.totalUsers)}</div>
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-full -z-10"></div>
                </div>
                <div className="relative overflow-hidden bg-[#242540]/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 transition-all hover:border-solana-purple/30 hover:bg-[#2a2b45]/80">
                    <div className="text-xs text-gray-400 mb-1 font-medium">Global Swaps Executed</div>
                    <div className="text-xl font-bold text-white">{formatNum(stats.totalSwaps)}</div>
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-full -z-10"></div>
                </div>
                <div className="col-span-2 relative overflow-hidden bg-gradient-to-br from-[#242540]/80 to-[#1a1b2e]/90 backdrop-blur-xl border border-solana-green/20 rounded-2xl p-5 shadow-[0_8px_32px_rgba(74,222,128,0.05)] transition-all hover:shadow-[0_8px_32px_rgba(74,222,128,0.1)] hover:border-solana-green/40">
                    <div className="text-xs text-gray-400 mb-1 flex items-center justify-between">
                        <span className="font-semibold uppercase tracking-wider text-solana-green/80">Protocol Revenue</span>
                        <span className="text-solana-green text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-solana-green/10 border border-solana-green/20">All-time</span>
                    </div>
                    <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-solana-green to-emerald-300 mt-2">
                        {formatUsd(stats.totalFeesUsd)}
                    </div>
                    <div className="absolute -bottom-6 -right-6 text-solana-green/5 text-8xl pointer-events-none">
                        💰
                    </div>
                </div>
            </div>

            {/* Velocity Section */}
            <div className="flex items-center gap-2 mb-4">
                <div className="h-px bg-gradient-to-r from-solana-purple/50 to-transparent flex-1"></div>
                <h3 className="text-xs font-bold text-solana-purple uppercase tracking-widest px-2 shadow-solana-purple">Revenue Velocity</h3>
                <div className="h-px bg-gradient-to-l from-solana-purple/50 to-transparent flex-1"></div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-8">
                 <div className="bg-[#1e1f36]/80 backdrop-blur-sm border border-white/5 rounded-xl p-3 hover:bg-[#242540] transition-colors">
                    <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Last 24h</div>
                    <div className="text-lg font-bold text-white">{formatUsd(stats.feesToday.totalUsd)}</div>
                    <div className="text-[10px] text-solana-purple mt-1 flex items-center gap-1">
                        <span>🔄</span> {stats.feesToday.swapCount} swaps
                    </div>
                </div>
                <div className="bg-[#1e1f36]/80 backdrop-blur-sm border border-white/5 rounded-xl p-3 hover:bg-[#242540] transition-colors">
                    <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Last 7 Days</div>
                    <div className="text-lg font-bold text-white">{formatUsd(stats.fees7d.totalUsd)}</div>
                    <div className="text-[10px] text-solana-purple mt-1 flex items-center gap-1">
                        <span>🔄</span> {stats.fees7d.swapCount} swaps
                    </div>
                </div>
                <div className="bg-[#1e1f36]/80 backdrop-blur-sm border border-white/5 rounded-xl p-3 col-span-2 flex justify-between items-center hover:bg-[#242540] transition-colors">
                    <div>
                        <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Last 30 Days</div>
                        <div className="text-xl font-bold text-white">{formatUsd(stats.fees30d.totalUsd)}</div>
                    </div>
                    <div className="text-xs border border-solana-purple/30 bg-solana-purple/10 text-solana-purple px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span>🔄</span> {stats.fees30d.swapCount} swaps
                    </div>
                </div>
            </div>

            {/* Active Users Feed */}
            <div className="flex items-center gap-2 mb-4">
                <div className="h-px bg-gradient-to-r from-blue-400/50 to-transparent flex-1"></div>
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest px-2">Pulse Feed</h3>
                <div className="h-px bg-gradient-to-l from-blue-400/50 to-transparent flex-1"></div>
            </div>

            <div className="space-y-2 mb-8">
                {usersData.users.length === 0 ? (
                    <div className="text-center text-sm text-gray-500 py-6 bg-white/5 rounded-xl border border-white/5">Silence on the network</div>
                ) : (
                    usersData.users.slice(0, 10).map((u) => (
                        <div key={u.telegramId} className="bg-[#242540]/40 backdrop-blur border border-white/5 p-3 rounded-xl flex justify-between items-center transition-all hover:bg-[#2a2b45] hover:border-white/10 hover:-translate-y-0.5">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-xs font-bold">
                                    {u.telegramUsername?.charAt(0).toUpperCase() || "U"}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-semibold text-sm text-gray-100">
                                        {u.telegramUsername ? `@${u.telegramUsername}` : `User ${u.telegramId.slice(0,6)}...`}
                                    </span>
                                    <span className="text-[10px] text-gray-400/80 font-mono mt-0.5">
                                        {u.walletAddress ? `${u.walletAddress.slice(0, 4)}...${u.walletAddress.slice(-4)}` : "No wallet linked"}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <div className="flex flex-col items-center bg-black/20 rounded-md px-2 py-1 min-w-[36px]">
                                    <span className="text-[8px] text-gray-500 uppercase">Swaps</span>
                                    <span className="text-xs font-mono font-medium text-blue-300">{u.swapCount}</span>
                                </div>
                                <div className="flex flex-col items-center bg-black/20 rounded-md px-2 py-1 min-w-[36px]">
                                    <span className="text-[8px] text-gray-500 uppercase">Refs</span>
                                    <span className="text-xs font-mono font-medium text-pink-300">{u.referralCount}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            {/* Top Whales */}
            {usersData.topFeeGenerators && usersData.topFeeGenerators.length > 0 && (
                <>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-px bg-gradient-to-r from-yellow-500/50 to-transparent flex-1"></div>
                        <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-widest px-2">Whale Watch</h3>
                        <div className="h-px bg-gradient-to-l from-yellow-500/50 to-transparent flex-1"></div>
                    </div>

                    <div className="space-y-2 mb-6">
                        {usersData.topFeeGenerators.slice(0, 5).map((u, i) => (
                           <div key={u.userId} className="relative bg-gradient-to-r from-[#242540] to-[#1a1b2e] border border-yellow-500/20 p-3 rounded-xl flex justify-between items-center transition-all hover:border-yellow-500/50 hover:shadow-[0_0_15px_rgba(234,179,8,0.1)] overflow-hidden group">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-400 to-orange-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex items-center gap-3 pl-2">
                                    <div className="w-6 h-6 rounded-md bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-xs font-black text-yellow-500">
                                        #{i + 1}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-sm text-gray-100">Top User</span>
                                        <span className="text-[10px] text-gray-400">{u.swaps} historical swaps</span>
                                    </div>
                                </div>
                                <div className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
                                    {formatUsd(u.totalFeeUsd)}
                                </div>
                            </div> 
                        ))}
                    </div>
                </>
            )}

            <div className="mt-8 mb-4 border-t border-white/5 pt-4">
                 <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500 uppercase tracking-widest">
                    <span>Secured by</span>
                    <span className="font-bold text-solana-purple">Privy</span>
                    <span>&times;</span>
                    <span className="font-bold text-gray-300">HMAC Auth</span>
                 </div>
            </div>
        </div>
    );
}
