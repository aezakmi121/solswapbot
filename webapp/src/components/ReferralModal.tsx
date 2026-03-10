import { useState, useEffect } from "react";
import { fetchReferrals, ReferralItem } from "../lib/api";
import { toast } from "../lib/toast";

interface ReferralModalProps {
    referralCode: string;
    referralCount: number;
    referralEarningsUsd: number;
    onClose: () => void;
}

export function ReferralModal({ referralCode, referralCount, referralEarningsUsd, onClose }: ReferralModalProps) {
    const [referrals, setReferrals] = useState<ReferralItem[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const tg = (window as any).Telegram?.WebApp;
    const referralLink = `https://t.me/Swapsoulbot?start=ref_${referralCode}`;

    useEffect(() => {
        fetchReferrals({ limit: 20 })
            .then((data) => {
                setReferrals(data.referrals);
                setTotal(data.total);
                setHasMore(data.hasMore);
            })
            .catch(() => toast("Failed to load referrals", "error"))
            .finally(() => setLoading(false));
    }, []);

    const loadMore = () => {
        setLoadingMore(true);
        fetchReferrals({ offset: referrals.length, limit: 20 })
            .then((data) => {
                setReferrals((prev) => [...prev, ...data.referrals]);
                setHasMore(data.hasMore);
            })
            .catch(() => toast("Failed to load more", "error"))
            .finally(() => setLoadingMore(false));
    };

    const handleShare = () => {
        const text = "Swap tokens across 6 blockchains — right inside Telegram! Join me on SolSwap:";
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`);
        } else if (navigator.share) {
            navigator.share({ title: "SolSwap", text, url: referralLink }).catch(() => {});
        } else {
            navigator.clipboard.writeText(referralLink).then(() => toast("Link copied!")).catch(() => {});
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(referralLink).then(() => {
            toast("Referral link copied!");
            tg?.HapticFeedback?.notificationOccurred("success");
        }).catch(() => {});
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const formatUsername = (username: string | null) => {
        if (!username) return "Anonymous";
        return `@${username}`;
    };

    return (
        <div className="ref-modal-overlay" onClick={onClose}>
            <div className="ref-modal-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="ref-modal-handle" />

                {/* Header */}
                <div className="ref-modal-header">
                    <h2 className="ref-modal-title">Referral Program</h2>
                    <button className="ref-modal-close" onClick={onClose}>&#x2715;</button>
                </div>

                {/* Stats */}
                <div className="ref-modal-stats">
                    <div className="ref-modal-stat">
                        <span className="ref-modal-stat-value ref-modal-stat--earnings">
                            ${referralEarningsUsd.toFixed(2)}
                        </span>
                        <span className="ref-modal-stat-label">Total Earned</span>
                    </div>
                    <div className="ref-modal-stat-divider" />
                    <div className="ref-modal-stat">
                        <span className="ref-modal-stat-value ref-modal-stat--count">
                            {referralCount}
                        </span>
                        <span className="ref-modal-stat-label">Referrals</span>
                    </div>
                    <div className="ref-modal-stat-divider" />
                    <div className="ref-modal-stat">
                        <span className="ref-modal-stat-value">25%</span>
                        <span className="ref-modal-stat-label">Fee Share</span>
                    </div>
                </div>

                {/* Share actions */}
                <div className="ref-modal-actions">
                    <button className="ref-modal-share-btn" onClick={handleShare}>
                        Invite Friends
                    </button>
                    <button className="ref-modal-copy-btn" onClick={handleCopyLink}>
                        Copy Link
                    </button>
                </div>

                {/* How it works */}
                <div className="ref-modal-how">
                    <div className="ref-modal-how-title">How It Works</div>
                    <div className="ref-modal-steps">
                        <div className="ref-modal-step">
                            <span className="ref-modal-step-num">1</span>
                            <span>Share your referral link</span>
                        </div>
                        <div className="ref-modal-step">
                            <span className="ref-modal-step-num">2</span>
                            <span>Friends join and start swapping</span>
                        </div>
                        <div className="ref-modal-step">
                            <span className="ref-modal-step-num">3</span>
                            <span>You earn 25% of their swap fees</span>
                        </div>
                    </div>
                </div>

                {/* Referral list */}
                <div className="ref-modal-list-section">
                    <div className="ref-modal-list-header">
                        Your Referrals {total > 0 && <span className="ref-modal-list-count">({total})</span>}
                    </div>

                    {loading ? (
                        <div className="ref-modal-loading">Loading...</div>
                    ) : referrals.length === 0 ? (
                        <div className="ref-modal-empty">
                            <p>No referrals yet</p>
                            <p className="ref-modal-empty-sub">Share your link to start earning!</p>
                        </div>
                    ) : (
                        <>
                            <div className="ref-modal-list">
                                {referrals.map((r, i) => (
                                    <div key={i} className="ref-modal-item">
                                        <div className="ref-modal-item-left">
                                            <span className="ref-modal-item-username">{formatUsername(r.telegramUsername)}</span>
                                            <span className="ref-modal-item-date">Joined {formatDate(r.joinedAt)}</span>
                                        </div>
                                        <div className="ref-modal-item-right">
                                            <span className="ref-modal-item-swaps">{r.swapCount} swaps</span>
                                            <span className="ref-modal-item-earned">${r.feesGeneratedUsd.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {hasMore && (
                                <button
                                    className="ref-modal-load-more"
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? "Loading..." : "Load More"}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
