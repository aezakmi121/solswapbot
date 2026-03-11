import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Copy, Check, QrCode, LogOut } from "lucide-react";
import { fetchUser, UserData } from "../lib/api";
import { ReceiveModal } from "./ReceiveModal";
import { TermsModal } from "./TermsModal";
import { ReferralModal } from "./ReferralModal";
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
    const { logout } = usePrivy();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [addrCopied, setAddrCopied] = useState(false);
    const [evmAddrCopied, setEvmAddrCopied] = useState(false);
    const [refCopied, setRefCopied] = useState(false);
    const [customSlippage, setCustomSlippage] = useState("");
    const [showCustom, setShowCustom] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [showReferralModal, setShowReferralModal] = useState(false);

    useEffect(() => {
        fetchUser().then(setUserData).catch(() => {});
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
                    <p className="settings-about-name">SolSwap v0.9.1</p>
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
                <button className="logout-btn logout-btn--settings" onClick={logout} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
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
        </div>
    );
}
