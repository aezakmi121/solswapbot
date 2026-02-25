import { useState, useEffect, useCallback } from "react";
import { usePrivy, useLoginWithTelegram } from "@privy-io/react-auth";
import { useWallets, useSignAndSendTransaction } from "@privy-io/react-auth/solana";
import {
    TokenInfo,
    QuoteDisplay,
    fetchQuote,
    fetchSwapTransaction,
    fetchPopularTokens,
    saveWalletAddress,
    fetchHistory,
    SwapRecord,
} from "./lib/api";
import { TokenSelector } from "./TokenSelector";

// Telegram WebApp SDK type
const tg = (window as any).Telegram?.WebApp;

/** Get the Telegram user ID from the WebApp SDK */
function getTelegramUserId(): string | null {
    try {
        return tg?.initDataUnsafe?.user?.id?.toString() ?? null;
    } catch {
        return null;
    }
}

/** Convert a Uint8Array signature to base58 string for Solscan links */
function uint8ToBase58(bytes: Uint8Array): string {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = BigInt(0);
    for (const byte of bytes) {
        num = num * 256n + BigInt(byte);
    }
    let str = "";
    while (num > 0n) {
        str = ALPHABET[Number(num % 58n)] + str;
        num = num / 58n;
    }
    for (const byte of bytes) {
        if (byte === 0) str = "1" + str;
        else break;
    }
    return str;
}

export function App() {
    const { ready, authenticated, logout } = usePrivy();
    const { login: loginWithTelegram } = useLoginWithTelegram();
    const { wallets } = useWallets();
    const { signAndSendTransaction } = useSignAndSendTransaction();

    // Wallet state
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [walletSaved, setWalletSaved] = useState(false);

    // Auto-login with Telegram when inside the Telegram WebApp
    useEffect(() => {
        if (ready && !authenticated && tg?.initData) {
            loginWithTelegram().catch((err: unknown) =>
                console.error("Telegram auto-login failed:", err)
            );
        }
    }, [ready, authenticated]);

    // Token loading from Jupiter API
    const [tokensLoaded, setTokensLoaded] = useState(false);
    const [inputToken, setInputToken] = useState<TokenInfo | null>(null);
    const [outputToken, setOutputToken] = useState<TokenInfo | null>(null);

    // Load popular tokens on mount to set defaults
    useEffect(() => {
        fetchPopularTokens()
            .then((tokens) => {
                if (tokens.length >= 2) {
                    setInputToken(tokens[0]);  // SOL
                    setOutputToken(tokens[1]); // USDC
                }
                setTokensLoaded(true);
            })
            .catch((err) => {
                console.error("Failed to load tokens:", err);
                setTokensLoaded(true);
            });
    }, []);

    // Token selector modal state
    const [selectorOpen, setSelectorOpen] = useState<"input" | "output" | null>(null);

    const [amount, setAmount] = useState("");

    // Quote state
    const [quote, setQuote] = useState<{ raw: any; display: QuoteDisplay } | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState("");

    // Swap state
    const [swapStatus, setSwapStatus] = useState<
        "idle" | "building" | "signing" | "confirming" | "done" | "error"
    >("idle");
    const [swapError, setSwapError] = useState("");
    const [txSignature, setTxSignature] = useState<string | null>(null);

    // History
    const [history, setHistory] = useState<SwapRecord[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    // Get the embedded Solana wallet from Privy
    const embeddedWallet = wallets.length > 0 ? wallets[0] : null;

    // Set wallet address when embedded wallet is available
    useEffect(() => {
        if (embeddedWallet?.address) {
            setWalletAddress(embeddedWallet.address);
        }
    }, [embeddedWallet?.address]);

    // Save wallet to backend when we have both telegramId and wallet
    useEffect(() => {
        if (!walletAddress || walletSaved) return;
        const telegramId = getTelegramUserId();
        if (!telegramId) return;

        saveWalletAddress(telegramId, walletAddress)
            .then(() => setWalletSaved(true))
            .catch((err: unknown) => console.error("Failed to save wallet:", err));
    }, [walletAddress, walletSaved]);

    // Fetch quote when inputs change (debounced)
    const getQuote = useCallback(async () => {
        if (!inputToken || !outputToken || !amount || Number(amount) <= 0) {
            setQuote(null);
            return;
        }

        setQuoteLoading(true);
        setQuoteError("");

        try {
            const amountSmallest = Math.round(
                Number(amount) * 10 ** inputToken.decimals
            ).toString();

            const result = await fetchQuote({
                inputMint: inputToken.mint,
                outputMint: outputToken.mint,
                amount: amountSmallest,
                inputDecimals: inputToken.decimals,
                outputDecimals: outputToken.decimals,
            });

            setQuote({ raw: result.quote, display: result.display });
        } catch (err) {
            setQuoteError(err instanceof Error ? err.message : "Failed to get quote");
            setQuote(null);
        } finally {
            setQuoteLoading(false);
        }
    }, [inputToken, outputToken, amount]);

    useEffect(() => {
        const timer = setTimeout(getQuote, 600);
        return () => clearTimeout(timer);
    }, [getQuote]);

    // Flip tokens
    const flipTokens = () => {
        const temp = inputToken;
        setInputToken(outputToken);
        setOutputToken(temp);
        setAmount("");
        setQuote(null);
    };

    // Execute swap
    const handleSwap = async () => {
        if (!walletAddress || !quote || !embeddedWallet) return;

        try {
            setSwapStatus("building");
            setSwapError("");
            setTxSignature(null);

            const { swapTransaction } = await fetchSwapTransaction({
                quoteResponse: quote.raw,
                userPublicKey: walletAddress,
            });

            setSwapStatus("signing");

            const txBytes = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));

            const { signature } = await signAndSendTransaction({
                transaction: txBytes,
                wallet: embeddedWallet,
                chain: "solana:mainnet",
            });

            const sigString = uint8ToBase58(signature);
            setTxSignature(sigString);
            setSwapStatus("confirming");

            setTimeout(() => setSwapStatus("done"), 2000);
        } catch (err) {
            console.error("Swap error:", err);
            setSwapError(err instanceof Error ? err.message : "Transaction failed");
            setSwapStatus("error");
        }
    };

    // Load swap history
    const loadHistory = async () => {
        const telegramId = getTelegramUserId();
        if (!telegramId) return;
        try {
            const data = await fetchHistory(telegramId);
            setHistory(data);
            setShowHistory(true);
        } catch (err) {
            console.error("Failed to load history:", err);
        }
    };

    // Helpers
    const formatUsd = (v: number | null) =>
        v !== null ? `$${v.toFixed(2)}` : "";
    const formatRate = (r: number) =>
        r < 0.01
            ? r.toPrecision(4)
            : r < 1
                ? r.toFixed(6)
                : r.toFixed(r > 100 ? 0 : 2);
    const shortAddr = (addr: string) =>
        `${addr.slice(0, 4)}...${addr.slice(-4)}`;

    // ────────────────── RENDER ──────────────────

    // Privy not ready yet
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

    // Not authenticated — show login
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

    // Authenticated but wallet or tokens not ready yet
    if (!walletAddress || !tokensLoaded) {
        return (
            <div className="app">
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>{!walletAddress ? "Setting up your wallet..." : "Loading tokens..."}</p>
                </div>
            </div>
        );
    }

    // ────────── MAIN SWAP UI ──────────

    /** Renders a token button that opens the selector */
    const renderTokenButton = (token: TokenInfo | null, side: "input" | "output") => (
        <button
            className="token-btn"
            onClick={() => setSelectorOpen(side)}
        >
            {token?.icon && (
                <img
                    className="token-btn-icon"
                    src={token.icon}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
            )}
            <span className="token-btn-symbol">
                {token?.symbol ?? "Select"}
            </span>
            <span className="token-btn-arrow">▼</span>
        </button>
    );

    return (
        <div className="app">
            <header className="header">
                <h1 className="logo">⚡ SolSwap</h1>
                <div className="wallet-badge" onClick={loadHistory}>
                    <span className="wallet-dot" />
                    {shortAddr(walletAddress)}
                </div>
            </header>

            <main className="swap-card">
                {/* ── You sell ── */}
                <div className="token-section">
                    <label className="token-label">You sell</label>
                    <div className="token-row">
                        {renderTokenButton(inputToken, "input")}
                        <input
                            type="number"
                            className="amount-input"
                            placeholder="0.0"
                            value={amount}
                            onChange={(e) => {
                                setAmount(e.target.value);
                                setSwapStatus("idle");
                            }}
                            min="0"
                            step="any"
                            inputMode="decimal"
                        />
                    </div>
                    {quote?.display.inputUsd != null && (
                        <span className="usd-value">
                            ~{formatUsd(quote.display.inputUsd)}
                        </span>
                    )}
                </div>

                {/* ── Flip ── */}
                <button
                    className="flip-btn"
                    onClick={flipTokens}
                    aria-label="Swap direction"
                >
                    ⇅
                </button>

                {/* ── You receive ── */}
                <div className="token-section">
                    <label className="token-label">You receive</label>
                    <div className="token-row">
                        {renderTokenButton(outputToken, "output")}
                        <div className="output-amount">
                            {quoteLoading ? (
                                <span className="pulse">Fetching...</span>
                            ) : quote ? (
                                quote.display.outputAmount
                            ) : (
                                "0.0"
                            )}
                        </div>
                    </div>
                    {quote?.display.outputUsd != null && (
                        <span className="usd-value">
                            ~{formatUsd(quote.display.outputUsd)}
                        </span>
                    )}
                </div>

                {/* ── Quote breakdown ── */}
                {quote && inputToken && outputToken && (
                    <div className="breakdown">
                        <div className="breakdown-row">
                            <span>Rate</span>
                            <span>
                                1 {inputToken.symbol} ={" "}
                                {formatRate(quote.display.exchangeRate)} {outputToken.symbol}
                            </span>
                        </div>
                        <div className="breakdown-row">
                            <span>Fee (0.5%)</span>
                            <span>
                                {quote.display.feeAmount} {outputToken.symbol}
                                {quote.display.feeUsd != null &&
                                    ` (~${formatUsd(quote.display.feeUsd)})`}
                            </span>
                        </div>
                        <div className="breakdown-row">
                            <span>Price impact</span>
                            <span>
                                {quote.display.priceImpactPct < 0.01
                                    ? "<0.01%"
                                    : `${quote.display.priceImpactPct.toFixed(2)}%`}
                            </span>
                        </div>
                        <div className="breakdown-row">
                            <span>Slippage</span>
                            <span>{(quote.display.slippageBps / 100).toFixed(1)}%</span>
                        </div>
                        <div className="breakdown-route">
                            ⚡ Best route via Jupiter
                        </div>
                    </div>
                )}

                {quoteError && <div className="error-msg">{quoteError}</div>}

                {/* ── Swap button ── */}
                <button
                    className="swap-btn"
                    disabled={!quote || swapStatus === "building" || swapStatus === "signing" || swapStatus === "confirming"}
                    onClick={handleSwap}
                >
                    {swapStatus === "building"
                        ? "Building transaction..."
                        : swapStatus === "signing"
                            ? "Approve in wallet..."
                            : swapStatus === "confirming"
                                ? "Confirming on-chain..."
                                : swapStatus === "done"
                                    ? "Swap complete!"
                                    : swapStatus === "error"
                                        ? "Failed — Try Again"
                                        : quote && inputToken
                                            ? `Swap ${amount} ${inputToken.symbol} → ${outputToken?.symbol}`
                                            : "Enter an amount"}
                </button>

                {swapStatus === "done" && txSignature && (
                    <div className="sign-hint">
                        <p>Transaction confirmed on Solana.</p>
                        <a
                            className="tx-link"
                            href={`https://solscan.io/tx/${txSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            View on Solscan
                        </a>
                        <button
                            className="reset-btn"
                            onClick={() => {
                                setSwapStatus("idle");
                                setAmount("");
                                setQuote(null);
                                setTxSignature(null);
                            }}
                        >
                            New Swap
                        </button>
                    </div>
                )}

                {swapStatus === "error" && (
                    <div className="error-msg">
                        {swapError || "Transaction failed"}
                        <button
                            className="reset-btn"
                            onClick={() => {
                                setSwapStatus("idle");
                                setSwapError("");
                            }}
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </main>

            {/* ── Token Selector Modal ── */}
            <TokenSelector
                open={selectorOpen !== null}
                onClose={() => setSelectorOpen(null)}
                onSelect={(token) => {
                    if (selectorOpen === "input") {
                        // If picking the same token as output, swap them
                        if (outputToken && token.mint === outputToken.mint) {
                            setOutputToken(inputToken);
                        }
                        setInputToken(token);
                    } else {
                        if (inputToken && token.mint === inputToken.mint) {
                            setInputToken(outputToken);
                        }
                        setOutputToken(token);
                    }
                    setQuote(null);
                }}
                excludeMint={
                    selectorOpen === "input"
                        ? outputToken?.mint
                        : inputToken?.mint
                }
            />

            {/* ── History Panel ── */}
            {showHistory && (
                <div className="history-overlay" onClick={() => setShowHistory(false)}>
                    <div className="history-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="history-header">
                            <h3>Swap History</h3>
                            <button className="history-close" onClick={() => setShowHistory(false)}>
                                ×
                            </button>
                        </div>
                        {history.length === 0 ? (
                            <p className="history-empty">No swaps yet</p>
                        ) : (
                            <div className="history-list">
                                {history.map((swap) => (
                                    <div key={swap.id} className="history-item">
                                        <div className="history-pair">
                                            {swap.inputSymbol} → {swap.outputSymbol}
                                        </div>
                                        <div className="history-detail">
                                            <span>{swap.inputAmount}</span>
                                            <span className={`history-status status-${swap.status.toLowerCase()}`}>
                                                {swap.status}
                                            </span>
                                        </div>
                                        <div className="history-date">
                                            {new Date(swap.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <footer className="footer">
                <span>Non-custodial · Your keys, your coins · 0.5% fee</span>
                <button className="logout-btn" onClick={logout}>
                    Log out
                </button>
            </footer>
        </div>
    );
}
