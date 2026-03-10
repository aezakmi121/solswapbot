import { useState, useEffect, useCallback } from "react";
import { usePrivy, useLoginWithTelegram } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import {
    TokenInfo,
    TokenBalance,
    saveWalletAddress,
    registerEvmWallet,
    fetchUser,
    fetchBalances,
} from "./lib/api";
import { TabBar, TabId } from "./components/TabBar";
import { SwapPanel } from "./components/SwapPanel";
import { WalletTab } from "./components/WalletTab";
import { ScanPanel } from "./components/ScanPanel";
import { TrackerPanel } from "./components/TrackerPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { AdminPanel } from "./components/AdminPanel";
import { Toast } from "./components/Toast";
import { TermsModal, hasAcceptedTerms } from "./components/TermsModal";
import { TransactionsTab } from "./components/TransactionsTab";

const SLIPPAGE_KEY = "solswap_slippage_bps";

function loadSlippage(): number {
    const stored = localStorage.getItem(SLIPPAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 && parsed <= 5000 ? parsed : 50;
}

// Telegram WebApp SDK
const tg = (window as any).Telegram?.WebApp;

export function App() {
    const { ready, authenticated, user } = usePrivy();
    const { login: loginWithTelegram } = useLoginWithTelegram();
    const { wallets } = useWallets();

    // ── Shared state (used across tabs) ──
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [walletSaved, setWalletSaved] = useState(false);
    const [evmWalletAddress, setEvmWalletAddress] = useState<string | null>(null);
    const [evmWalletSaved, setEvmWalletSaved] = useState(false);
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);

    // ── Tab navigation with haptic ──
    const [activeTab, setActiveTab] = useState<TabId>("wallet");
    const handleTabChange = (tab: TabId) => {
        (tg as any)?.HapticFeedback?.selectionChanged();
        setActiveTab(tab);
    };

    // ── Terms of Use (first-launch gate) ──
    const [termsAccepted, setTermsAccepted] = useState<boolean>(hasAcceptedTerms);

    // ── Pending swap token (from Scan → "Swap This Token") ──
    const [pendingSwapToken, setPendingSwapToken] = useState<TokenInfo | null>(null);

    // ── Slippage (persisted in localStorage) ──
    const [slippageBps, setSlippageBps] = useState<number>(loadSlippage);
    const handleSlippageChange = (bps: number) => {
        setSlippageBps(bps);
        localStorage.setItem(SLIPPAGE_KEY, String(bps));
    };

    // ── Auto-login with Telegram ──
    useEffect(() => {
        if (ready && !authenticated && tg?.initData) {
            loginWithTelegram().catch((err: unknown) =>
                console.error("Telegram auto-login failed:", err)
            );
        }
    // loginWithTelegram is stable from Privy SDK and safe to include (M17)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, authenticated, loginWithTelegram]);

    // ── Sync Solana wallet address from Privy ──
    const embeddedWallet = wallets.length > 0 ? wallets[0] : null;
    useEffect(() => {
        if (embeddedWallet?.address) {
            setWalletAddress(embeddedWallet.address);
        }
    }, [embeddedWallet?.address]);

    // ── Save Solana wallet to backend (once, on first connect) ──
    useEffect(() => {
        if (!walletAddress || walletSaved || !tg?.initData) return;
        saveWalletAddress(walletAddress)
            .then(() => setWalletSaved(true))
            .catch((err: unknown) => console.error("Failed to save wallet:", err));
    // saveWalletAddress is a stable module-level import (M17)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletAddress, walletSaved]);

    // ── Sync EVM wallet address from Privy (user.linkedAccounts is reliable across Privy v3) ──
    // Cast as any: LinkedAccountWithMetadata is a union that omits `address` on non-wallet subtypes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evmWallet = user?.linkedAccounts?.find(
        (a: any) => a.type === "wallet" && a.walletClientType === "privy" && a.chainType === "ethereum"
    ) as any;
    useEffect(() => {
        if (evmWallet?.address) {
            setEvmWalletAddress(evmWallet.address);
        }
    }, [evmWallet?.address]);

    // ── Save EVM wallet to backend (once, on first detect) ──
    useEffect(() => {
        if (!evmWalletAddress || evmWalletSaved || !tg?.initData) return;
        registerEvmWallet(evmWalletAddress)
            .then(() => setEvmWalletSaved(true))
            .catch((err: unknown) => console.error("Failed to save EVM wallet:", err));
    // registerEvmWallet is a stable module-level import (M17)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [evmWalletAddress, evmWalletSaved]);

    // ── Refresh SOL balance + all token balances (shared for swap balance checks) ──
    const refreshBalance = useCallback(() => {
        if (!walletAddress) return;
        if (tg?.initData) {
            fetchUser()
                .then((data) => {
                    setSolBalance(data.solBalance);
                    setIsAdmin(!!data.isAdmin);
                })
                .catch(() => {});
        }
        fetchBalances(walletAddress)
            .then(setTokenBalances)
            .catch(() => {});
    }, [walletAddress]);

    useEffect(() => {
        if (!walletAddress) return;
        refreshBalance();
    }, [walletAddress, refreshBalance]);

    const balancesLoaded = tokenBalances.length > 0;
    const shortAddr = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

    // ── Terms gate (must accept before using app) ──
    if (!termsAccepted) {
        return (
            <div className="app">
                <TermsModal onAccept={() => setTermsAccepted(true)} />
            </div>
        );
    }

    // ── Loading ──
    if (!ready) {
        return (
            <div className="app">
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    // ── Onboarding ──
    if (!authenticated) {
        return (
            <div className="app">
                <div className="onboard-screen">
                    <div className="onboard-icon">⚡</div>
                    <h2>SolSwap</h2>
                    <p className="onboard-text">
                        Swap tokens across Solana, Ethereum, and more — right inside Telegram.
                    </p>
                    <button className="swap-btn" onClick={() => loginWithTelegram()}>
                        Log In with Telegram
                    </button>
                    <p className="onboard-hint">
                        A secure wallet is created automatically for you.
                    </p>
                </div>
            </div>
        );
    }

    // ── Wallet setup ──
    if (!walletAddress) {
        return (
            <div className="app">
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>Setting up your wallet...</p>
                </div>
            </div>
        );
    }

    // ── Main tab layout ──
    return (
        <div className="app app--tabbed">
            {/* ── Shared header ── */}
            <header className="header">
                <h1 className="logo">⚡ SolSwap</h1>
                <div className="header-actions">
                    {/* Wallet address badge — tap to go to Wallet tab */}
                    <div
                        className="wallet-badge"
                        onClick={() => handleTabChange("wallet")}
                        style={{ cursor: "pointer" }}
                        title="Go to Wallet"
                    >
                        <span className="wallet-dot" />
                        <span>{shortAddr(walletAddress)}</span>
                    </div>

                    {/* History icon */}
                    <button
                        className={`header-icon-btn${activeTab === "history" ? " header-icon-btn--active" : ""}`}
                        onClick={() => handleTabChange("history")}
                        title="Transaction History"
                        aria-label="History"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
                            <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    {/* Settings icon */}
                    <button
                        className={`header-icon-btn${activeTab === "settings" ? " header-icon-btn--active" : ""}`}
                        onClick={() => handleTabChange("settings")}
                        title="Settings"
                        aria-label="Settings"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.75" />
                        </svg>
                    </button>

                    {/* Admin icon — only shown to admins */}
                    {isAdmin && (
                        <button
                            className={`header-icon-btn header-icon-btn--admin${activeTab === "admin" ? " header-icon-btn--active" : ""}`}
                            onClick={() => handleTabChange("admin")}
                            title="Admin Panel"
                            aria-label="Admin"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    )}
                </div>
            </header>

            {/* ── Tab content ── */}
            <main className="tab-content">
                {activeTab === "wallet" && (
                    <WalletTab
                        walletAddress={walletAddress}
                        solBalance={solBalance}
                        onNavigateToSwap={() => setActiveTab("swap")}
                    />
                )}
                {activeTab === "swap" && (
                    <SwapPanel
                        walletAddress={walletAddress}
                        evmWalletAddress={evmWalletAddress}
                        tokenBalances={tokenBalances}
                        balancesLoaded={balancesLoaded}
                        refreshBalance={refreshBalance}
                        slippageBps={slippageBps}
                        onSlippageChange={handleSlippageChange}
                        initialOutputToken={pendingSwapToken}
                        onInitialTokenConsumed={() => setPendingSwapToken(null)}
                    />
                )}
                {activeTab === "scan" && (
                    <ScanPanel onNavigateToSwap={(token) => {
                        if (token) setPendingSwapToken(token);
                        setActiveTab("swap");
                    }} />
                )}
                {activeTab === "tracker" && (
                    <TrackerPanel />
                )}
                {activeTab === "history" && (
                    <TransactionsTab walletAddress={walletAddress} />
                )}
                {activeTab === "settings" && (
                    <SettingsPanel
                        walletAddress={walletAddress}
                        evmWalletAddress={evmWalletAddress}
                        slippageBps={slippageBps}
                        onSlippageChange={handleSlippageChange}
                    />
                )}
                {activeTab === ("admin" as TabId) && isAdmin && (
                    <AdminPanel />
                )}
            </main>

            {/* ── Bottom tab bar (4 core tabs only) ── */}
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

            {/* ── Toast notifications ── */}
            <Toast />
        </div>
    );
}
