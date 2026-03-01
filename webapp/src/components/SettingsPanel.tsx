import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { fetchUser, UserData } from "../lib/api";
import { ReceiveModal } from "./ReceiveModal";
import { TermsModal } from "./TermsModal";
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
        ? `https://t.me/solswapbot?start=ref_${userData.referralCode}`
        : "";

    const handleCopyRef = () => {
        if (!referralLink) return;
        navigator.clipboard.writeText(referralLink).then(() => {
            setRefCopied(true);
            setTimeout(() => setRefCopied(false), 2000);
            toast("Referral link copied!");
        }).catch(() => {});
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
                            <button className="settings-icon-btn" onClick={handleCopyAddr} title="Copy Solana address">
                                {addrCopied ? "✓" : "📋"}
                            </button>
                            <button className="settings-icon-btn" onClick={() => setShowQr(true)} title="Show QR code">
                                🔲
                            </button>
                        </div>
                    </div>

                    {/* EVM wallet (shown when Privy has created one) */}
                    {evmWalletAddress && (
                        <div className="settings-row">
                            <span className="settings-label">🔷 EVM</span>
                            <div className="settings-addr-row">
                                <span className="settings-addr">{shortAddr(evmWalletAddress)}</span>
                                <button className="settings-icon-btn" onClick={handleCopyEvmAddr} title="Copy EVM address">
                                    {evmAddrCopied ? "✓" : "📋"}
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

            {/* ── Referral ── */}
            {userData?.referralCode && (
                <div className="settings-section">
                    <div className="settings-section-title">Referral</div>
                    <div className="settings-card">
                        <div className="settings-row">
                            <span className="settings-label">Your Code</span>
                            <div className="settings-addr-row">
                                <span className="settings-referral-code">{userData.referralCode.slice(0, 8)}</span>
                                <button className="settings-icon-btn" onClick={handleCopyRef} title="Copy referral link">
                                    {refCopied ? "✓" : "📋"}
                                </button>
                            </div>
                        </div>
                        {userData.referralCount !== undefined && (
                            <div className="settings-row">
                                <span className="settings-label">Referrals</span>
                                <span className="settings-value">{userData.referralCount} users</span>
                            </div>
                        )}
                        <button className="settings-share-btn" onClick={handleCopyRef}>
                            {refCopied ? "✓ Link Copied!" : "Share Referral Link"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── About ── */}
            <div className="settings-section">
                <div className="settings-section-title">About</div>
                <div className="settings-card settings-about">
                    <p className="settings-about-name">SolSwap v0.4.0</p>
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

            {/* ── Logout ── */}
            <div className="settings-section">
                <button className="logout-btn logout-btn--settings" onClick={logout}>
                    🚪 Log Out
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
        </div>
    );
}
