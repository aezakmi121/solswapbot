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

// Telegram WebApp SDK
const tg = (window as any).Telegram?.WebApp;

export function App() {
    const { ready, authenticated, logout } = usePrivy();
    const { login: loginWithTelegram } = useLoginWithTelegram();
    const { wallets } = useWallets();

    // ── Shared state (used across tabs) ──
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [walletSaved, setWalletSaved] = useState(false);
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);

    // ── Tab navigation ──
    const [activeTab, setActiveTab] = useState<TabId>("wallet");

    // ── Auto-login with Telegram ──
    useEffect(() => {
        if (ready && !authenticated && tg?.initData) {
            loginWithTelegram().catch((err: unknown) =>
                console.error("Telegram auto-login failed:", err)
            );
        }
    }, [ready, authenticated]);

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
                    />
                )}
                {activeTab === "scan" && (
                    <div className="placeholder-tab">
                        <div className="placeholder-icon">🔍</div>
                        <h3>Token Scanner</h3>
                        <p>Coming in Sprint 2B — scan any token for rug risks, mint authority, top holder concentration, and more.</p>
                    </div>
                )}
                {activeTab === "settings" && (
                    <div className="placeholder-tab">
                        <div className="placeholder-icon">⚙️</div>
                        <h3>Settings</h3>
                        <p>Coming in Sprint 2B — slippage tolerance, referral code, wallet QR, and logout.</p>
                        <button className="logout-btn logout-btn--settings" onClick={logout}>
                            Log Out
                        </button>
                    </div>
                )}
            </main>

            {/* ── Bottom tab bar ── */}
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
    );
}
