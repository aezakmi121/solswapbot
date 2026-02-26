import { useState, useEffect, useCallback } from "react";
import { usePrivy, useLoginWithTelegram } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import {
    TokenBalance,
    saveWalletAddress,
    fetchUser,
    fetchBalances,
} from "./lib/api";
import { TabBar, TabId } from "./components/TabBar";
import { SwapPanel } from "./components/SwapPanel";
import { WalletTab } from "./components/WalletTab";
import { ScanPanel } from "./components/ScanPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toast } from "./components/Toast";

const SLIPPAGE_KEY = "solswap_slippage_bps";

function loadSlippage(): number {
    const stored = localStorage.getItem(SLIPPAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 && parsed <= 5000 ? parsed : 50;
}

// Telegram WebApp SDK
const tg = (window as any).Telegram?.WebApp;

export function App() {
    const { ready, authenticated } = usePrivy();
    const { login: loginWithTelegram } = useLoginWithTelegram();
    const { wallets } = useWallets();

    // ── Shared state (used across tabs) ──
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [walletSaved, setWalletSaved] = useState(false);
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);

    // ── Tab navigation with haptic ──
    const [activeTab, setActiveTab] = useState<TabId>("wallet");
    const handleTabChange = (tab: TabId) => {
        (tg as any)?.HapticFeedback?.selectionChanged();
        setActiveTab(tab);
    };

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

    // ── Sync wallet address from Privy ──
    const embeddedWallet = wallets.length > 0 ? wallets[0] : null;
    useEffect(() => {
        if (embeddedWallet?.address) {
            setWalletAddress(embeddedWallet.address);
        }
    }, [embeddedWallet?.address]);

    // ── Save wallet to backend (once, on first connect) ──
    useEffect(() => {
        if (!walletAddress || walletSaved || !tg?.initData) return;
        saveWalletAddress(walletAddress)
            .then(() => setWalletSaved(true))
            .catch((err: unknown) => console.error("Failed to save wallet:", err));
    // saveWalletAddress is a stable module-level import (M17)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletAddress, walletSaved]);

    // ── Refresh SOL balance + all token balances (shared for swap balance checks) ──
    const refreshBalance = useCallback(() => {
        if (!walletAddress) return;
        if (tg?.initData) {
            fetchUser()
                .then((data) => setSolBalance(data.solBalance))
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
                <div
                    className="wallet-badge"
                    onClick={() => setActiveTab("wallet")}
                    style={{ cursor: "pointer" }}
                >
                    <span className="wallet-dot" />
                    {shortAddr(walletAddress)}
                    {solBalance !== null && (
                        <span className="wallet-bal">
                            {solBalance < 0.001 ? "<0.001" : solBalance.toFixed(3)} SOL
                        </span>
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
                        tokenBalances={tokenBalances}
                        balancesLoaded={balancesLoaded}
                        refreshBalance={refreshBalance}
                        slippageBps={slippageBps}
                        onOpenSettings={() => setActiveTab("settings")}
                    />
                )}
                {activeTab === "scan" && (
                    <ScanPanel onNavigateToSwap={() => setActiveTab("swap")} />
                )}
                {activeTab === "settings" && (
                    <SettingsPanel
                        walletAddress={walletAddress}
                        slippageBps={slippageBps}
                        onSlippageChange={handleSlippageChange}
                    />
                )}
            </main>

            {/* ── Bottom tab bar ── */}
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

            {/* ── Toast notifications ── */}
            <Toast />
        </div>
    );
}
