import { useState, useEffect } from "react";
import { usePrivy, useLinkAccount, useExportWallet } from "@privy-io/react-auth";
import { Copy, Check, QrCode, LogOut, Mail, Key, Shield, Crown } from "lucide-react";
import { fetchUser, UserData, getSubscription, SubscriptionInfo } from "../lib/api";
import { ReceiveModal } from "./ReceiveModal";
import { TermsModal } from "./TermsModal";
import { ReferralModal } from "./ReferralModal";
import { UpgradeModal } from "./UpgradeModal";
import { toast } from "../lib/toast";

const SLIPPAGE_KEY = "solswap_slippage_bps";

const SLIPPAGE_OPTIONS = [
    { label: "0.1%", value: 10 },
    { label: "0.5%", value: 50 },
    { label: "1.0%", value: 100 },
];

interface SettingsPanelProps {
    walletAddress: string;
    evmWalletAddress?: string | null;
    slippageBps: number;
    onSlippageChange: (bps: number) => void;
}

export function SettingsPanel({ walletAddress, evmWalletAddress, slippageBps, onSlippageChange }: SettingsPanelProps) {
    const { logout, user } = usePrivy();
    const { linkEmail } = useLinkAccount({
        onSuccess: () => { toast("Recovery email linked!", "success"); },
        onError: (error) => { console.warn("Link email error:", error); toast("Failed to link email", "error"); },
    });
    const { exportWallet } = useExportWallet();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [addrCopied, setAddrCopied] = useState(false);
    const [evmAddrCopied, setEvmAddrCopied] = useState(false);
    const [refCopied, setRefCopied] = useState(false);
    const [customSlippage, setCustomSlippage] = useState("");
    const [showCustom, setShowCustom] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [showReferralModal, setShowReferralModal] = useState(false);
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

    const tg = (window as any).Telegram?.WebApp;
    const linkedEmail = user?.email?.address || null;

    useEffect(() => {
        fetchUser().then(setUserData).catch(() => {});
        getSubscription().then(setSubscription).catch(() => {});
    }, []);

    const handleCopyAddr = () => {
        navigator.clipboard.writeText(walletAddress).then(() => {
            setAddrCopied(true);
            setTimeout(() => setAddrCopied(false), 2000);
            toast("Solana address copied!");
        }).catch(() => {});
    };

    const handleCopyEvmAddr = () => {
        if (!evmWalletAddress) return;
        navigator.clipboard.writeText(evmWalletAddress).then(() => {
            setEvmAddrCopied(true);
            setTimeout(() => setEvmAddrCopied(false), 2000);
            toast("EVM address copied!");
        }).catch(() => {});
    };

    const referralLink = userData?.referralCode
        ? `https://t.me/Swapsoulbot?start=ref_${userData.referralCode}`
        : "";

    const handleCopyRef = () => {
        if (!referralLink) return;
        navigator.clipboard.writeText(referralLink).then(() => {
            setRefCopied(true);
            setTimeout(() => setRefCopied(false), 2000);
            toast("Referral link copied!");
        }).catch(() => {});
    };

    const handleShareRef = () => {
        if (!referralLink) return;
        const text = "Swap tokens across 6 blockchains — right inside Telegram! Join me on SolSwap:";
        const tg = (window as any).Telegram?.WebApp;
        // Try Telegram share first, then Web Share API, then clipboard
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`);
        } else if (navigator.share) {
            navigator.share({ title: "SolSwap", text, url: referralLink }).catch(() => {});
        } else {
            navigator.clipboard.writeText(referralLink).then(() => {
                setRefCopied(true);
                setTimeout(() => setRefCopied(false), 2000);
                toast("Referral link copied!");
            }).catch(() => {});
        }
    };

    const handleSlippageSelect = (bps: number) => {
        setShowCustom(false);
        onSlippageChange(bps);
        localStorage.setItem(SLIPPAGE_KEY, String(bps));
    };

    const handleCustomSlippage = () => {
        const val = parseFloat(customSlippage);
        if (!isNaN(val) && val > 0 && val <= 50) {
            handleSlippageSelect(Math.round(val * 100));
            setCustomSlippage("");
            setShowCustom(false);
        }
    };

    const handleLogout = async () => {
        const confirmed = window.confirm(
            "Logging out will close the app. You can log back in anytime with Telegram.\n\nMake sure you have a recovery email linked or your private key exported before logging out."
        );
        if (!confirmed) return;
        try {
            await logout();
            tg?.close();
        } catch {
            toast("Logout failed", "error");
        }
    };

    const handleExportWallet = async () => {
        tg?.HapticFeedback?.impactOccurred("medium");
        try {
            await exportWallet();
        } catch (err: any) {
            if (err?.message?.includes("user closed")) return;
            toast("Failed to export wallet", "error");
        }
    };

    const handleLinkEmail = () => {
        tg?.HapticFeedback?.impactOccurred("medium");
        linkEmail();
    };

    const isPreset = SLIPPAGE_OPTIONS.some((o) => o.value === slippageBps);
    const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    return (
        <div className="settings-panel">

            {/* ── Wallet ── */}
            <div className="settings-section">
                <div className="settings-section-title">Wallet</div>
                <div className="settings-card">
                    {/* Solana wallet */}
                    <div className="settings-row">
                        <span className="settings-label">🟣 Solana</span>
                        <div className="settings-addr-row">
                            <span className="settings-addr">{shortAddr(walletAddress)}</span>
                            <button className="settings-icon-btn" onClick={handleCopyAddr} title="Copy Solana address" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {addrCopied ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                            <button className="settings-icon-btn" onClick={() => setShowQr(true)} title="Show QR code" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <QrCode size={16} />
                            </button>
                        </div>
                    </div>

                    {/* EVM wallet (shown when Privy has created one) */}
                    {evmWalletAddress && (
                        <div className="settings-row">
                            <span className="settings-label">🔷 EVM</span>
                            <div className="settings-addr-row">
                                <span className="settings-addr">{shortAddr(evmWalletAddress)}</span>
                                <button className="settings-icon-btn" onClick={handleCopyEvmAddr} title="Copy EVM address" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {evmAddrCopied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                {evmWalletAddress && (
                    <p className="settings-evm-hint">
                        Use the 🔷 EVM address to receive bridged tokens (ETH, BNB, MATIC…)
                    </p>
                )}
            </div>

            {/* ── Subscription ── */}
            <div className="settings-section">
                <div className="settings-section-title">Subscription</div>
                <div className="settings-card">
                    <div className="settings-row">
                        <span className="settings-label">
                            <Crown size={16} style={{ color: subscription?.tier !== "FREE" && subscription?.isActive ? "#a855f7" : "#888" }} />
                            {" "}Current Plan
                        </span>
                        <span className={`settings-sub-tier ${subscription?.tier !== "FREE" && subscription?.isActive ? "active" : ""}`}>
                            {subscription?.tier?.replace("_", " ") ?? "FREE"}
                        </span>
                    </div>
                    {subscription?.expiresAt && subscription?.isActive && (
                        <div className="settings-row">
                            <span className="settings-label" style={{ fontSize: "12px", color: "#999" }}>Expires</span>
                            <span style={{ fontSize: "12px", color: "#999" }}>
                                {new Date(subscription.expiresAt).toLocaleDateString()}
                            </span>
                        </div>
                    )}
                    <button className="settings-sub-btn" onClick={() => setShowUpgrade(true)}>
                        {subscription?.tier === "FREE" || !subscription?.isActive ? "Upgrade Plan" : "Manage Subscription"}
                    </button>
                </div>
            </div>

            {/* ── Trading ── */}
            <div className="settings-section">
                <div className="settings-section-title">Trading</div>
                <div className="settings-card">
                    <div className="settings-row settings-row--col">
                        <span className="settings-label">Slippage Tolerance</span>
                        <div className="slippage-chips">
                            {SLIPPAGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    className={`slippage-chip${slippageBps === opt.value ? " slippage-chip--active" : ""}`}
                                    onClick={() => handleSlippageSelect(opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                            <button
                                className={`slippage-chip${!isPreset || showCustom ? " slippage-chip--active" : ""}`}
                                onClick={() => setShowCustom(!showCustom)}
                            >
                                {isPreset ? "Custom" : `${(slippageBps / 100).toFixed(2)}%`}
                            </button>
                        </div>
                        {showCustom && (
                            <div className="slippage-custom-row">
                                <input
                                    className="slippage-custom-input"
                                    type="number"
                                    placeholder="e.g. 2.5"
                                    min="0.01"
                                    max="50"
                                    step="0.1"
                                    value={customSlippage}
                                    onChange={(e) => setCustomSlippage(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCustomSlippage()}
                                />
                                <span className="slippage-pct-label">%</span>
                                <button className="slippage-set-btn" onClick={handleCustomSlippage}>Set</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Account Security ── */}
            <div className="settings-section">
                <div className="settings-section-title">Account Security</div>
                <div className="settings-card">
                    {/* Recovery Email */}
                    <div className="settings-row settings-row--col">
                        <div className="settings-security-header">
                            <Mail size={16} />
                            <span className="settings-label">Recovery Email</span>
                        </div>
                        {linkedEmail ? (
                            <div className="settings-security-status settings-security-status--linked">
                                <Check size={14} />
                                <span>{linkedEmail}</span>
                            </div>
                        ) : (
                            <p className="settings-security-hint">
                                Link an email to recover your wallet if you lose Telegram access.
                            </p>
                        )}
                        <button
                            className={`settings-security-btn${linkedEmail ? " settings-security-btn--secondary" : ""}`}
                            onClick={handleLinkEmail}
                        >
                            {linkedEmail ? "Update Email" : "Link Recovery Email"}
                        </button>
                    </div>

                    {/* Export Private Key */}
                    <div className="settings-row settings-row--col" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 4 }}>
                        <div className="settings-security-header">
                            <Key size={16} />
                            <span className="settings-label">Export Private Key</span>
                        </div>
                        <p className="settings-security-hint">
                            Back up your private key to use with any wallet app (Phantom, MetaMask, etc).
                        </p>
                        <button className="settings-security-btn settings-security-btn--secondary" onClick={handleExportWallet}>
                            Export Wallet Key
                        </button>
                    </div>
                </div>
                <p className="settings-security-footer">
                    <Shield size={12} /> Your keys are secured by Privy MPC. We never see or store your private key.
                </p>
            </div>

            {/* ── Referral Dashboard ── */}
            {userData?.referralCode && (
                <div className="settings-section">
                    <div className="settings-section-title">Referral Program</div>
                    <div className="referral-dashboard">
                        {/* Stats row */}
                        <div className="referral-hero">
                            <div className="referral-stats">
                                <div className="referral-stat">
                                    <span className="referral-stat-value referral-stat-value--earnings">
                                        ${(userData.referralEarningsUsd ?? 0).toFixed(2)}
                                    </span>
                                    <span className="referral-stat-label">Earned</span>
                                </div>
                                <div className="referral-stat">
                                    <span className="referral-stat-value referral-stat-value--count">
                                        {userData.referralCount ?? 0}
                                    </span>
                                    <span className="referral-stat-label">Referrals</span>
                                </div>
                            </div>
                        </div>

                        {/* Referral code */}
                        <div className="referral-code-row">
                            <span className="referral-code-value">{userData.referralCode.slice(0, 8)}</span>
                            <button className="referral-code-copy" onClick={handleCopyRef} title="Copy referral link" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {refCopied ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>

                        {/* Action buttons */}
                        <div className="referral-actions">
                            <button className="referral-share-btn" onClick={handleShareRef}>
                                {refCopied ? "✓ Link Copied!" : "Invite Friends"}
                            </button>
                            <button className="referral-details-btn" onClick={() => setShowReferralModal(true)}>
                                View Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── About ── */}
            <div className="settings-section">
                <div className="settings-section-title">About</div>
                <div className="settings-card settings-about">
                    <p className="settings-about-name">SolSwap v1.3.0</p>
                    <p className="settings-about-sub">Non-custodial · Privy MPC wallet</p>
                    <p className="settings-about-sub">Platform fee: 0.5% per swap</p>
                    <p className="settings-about-sub">Powered by Jupiter &amp; LI.FI</p>
                    <button
                        className="settings-terms-link"
                        onClick={() => setShowTerms(true)}
                    >
                        View Terms of Use
                    </button>
                </div>
            </div>

            <div className="settings-section">
                <button className="logout-btn logout-btn--settings" onClick={handleLogout} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <LogOut size={16} /> Log Out
                </button>
            </div>

            {/* QR modal (reuse ReceiveModal) */}
            {showQr && (
                <ReceiveModal walletAddress={walletAddress} onClose={() => setShowQr(false)} />
            )}

            {/* Terms of Use modal (re-readable from Settings) */}
            {showTerms && (
                <TermsModal onAccept={() => setShowTerms(false)} />
            )}

            {/* Referral detail modal */}
            {showReferralModal && userData?.referralCode && (
                <ReferralModal
                    referralCode={userData.referralCode}
                    referralCount={userData.referralCount ?? 0}
                    referralEarningsUsd={userData.referralEarningsUsd ?? 0}
                    onClose={() => setShowReferralModal(false)}
                />
            )}

            <UpgradeModal
                open={showUpgrade}
                onClose={() => {
                    setShowUpgrade(false);
                    // Refresh subscription status after closing (may have upgraded)
                    getSubscription().then(setSubscription).catch(() => {});
                }}
            />
        </div>
    );
}
