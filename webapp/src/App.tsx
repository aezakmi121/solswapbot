import { useState, useEffect, useCallback } from "react";
import {
    TOKENS,
    TokenInfo,
    QuoteDisplay,
    UserData,
    fetchUser,
    fetchQuote,
    fetchSwapTransaction,
} from "./lib/api";

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

export function App() {
    // User state
    const [user, setUser] = useState<UserData | null>(null);
    const [userLoading, setUserLoading] = useState(true);
    const [userError, setUserError] = useState("");

    // Swap form
    const [inputToken, setInputToken] = useState<TokenInfo>(TOKENS[0]); // SOL
    const [outputToken, setOutputToken] = useState<TokenInfo>(TOKENS[1]); // USDC
    const [amount, setAmount] = useState("");

    // Quote state
    const [quote, setQuote] = useState<{ raw: any; display: QuoteDisplay } | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState("");

    // Swap state
    const [swapStatus, setSwapStatus] = useState<
        "idle" | "building" | "opening" | "done" | "error"
    >("idle");

    // Load user on mount
    useEffect(() => {
        const telegramId = getTelegramUserId();
        if (!telegramId) {
            setUserError("Open this app from the Telegram bot to get started.");
            setUserLoading(false);
            return;
        }

        fetchUser(telegramId)
            .then(setUser)
            .catch((err) => setUserError(err.message))
            .finally(() => setUserLoading(false));
    }, []);

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
                inputSymbol: inputToken.symbol,
                outputSymbol: outputToken.symbol,
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

    // Execute swap — builds tx then opens Phantom to sign
    const handleSwap = async () => {
        if (!user?.walletAddress || !quote) return;

        try {
            setSwapStatus("building");

            const { swapTransaction } = await fetchSwapTransaction({
                quoteResponse: quote.raw,
                userPublicKey: user.walletAddress,
            });

            setSwapStatus("opening");

            // Convert base64 to base64url for the Phantom deep link
            const base64url = swapTransaction
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

            // Build Phantom universal link for signing
            const redirectUrl = encodeURIComponent(
                window.location.origin + "/?signed=true"
            );
            const phantomUrl =
                `https://phantom.app/ul/v1/signAndSendTransaction` +
                `?transaction=${encodeURIComponent(base64url)}` +
                `&redirect_link=${redirectUrl}`;

            // Open in external browser (not Telegram's WebView)
            // This allows Phantom to intercept on mobile or open in browser with extension
            if (tg?.openLink) {
                tg.openLink(phantomUrl);
            } else {
                window.open(phantomUrl, "_blank");
            }

            setSwapStatus("done");
        } catch (err) {
            console.error("Swap error:", err);
            setSwapStatus("error");
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

    // Loading state
    if (userLoading) {
        return (
            <div className="app">
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>Loading your wallet...</p>
                </div>
            </div>
        );
    }

    // Error / not in Telegram
    if (userError) {
        return (
            <div className="app">
                <div className="onboard-screen">
                    <div className="onboard-icon">⚡</div>
                    <h2>SolSwap</h2>
                    <p className="onboard-text">{userError}</p>
                    <p className="onboard-hint">
                        Open @YourBot on Telegram and type <code>/trade</code>
                    </p>
                </div>
            </div>
        );
    }

    // No wallet connected
    if (!user?.walletAddress) {
        return (
            <div className="app">
                <div className="onboard-screen">
                    <div className="onboard-icon">🔗</div>
                    <h2>Connect Your Wallet</h2>
                    <p className="onboard-text">
                        You need to link your Phantom wallet first.
                    </p>
                    <div className="onboard-steps">
                        <div className="step">
                            <span className="step-num">1</span>
                            <span>
                                Open the bot chat and send:
                                <br />
                                <code>/connect YOUR_WALLET_ADDRESS</code>
                            </span>
                        </div>
                        <div className="step">
                            <span className="step-num">2</span>
                            <span>Come back here and tap the button below</span>
                        </div>
                    </div>
                    <button
                        className="swap-btn"
                        onClick={() => window.location.reload()}
                    >
                        🔄 I've Connected — Refresh
                    </button>
                </div>
            </div>
        );
    }

    // ────────── MAIN SWAP UI ──────────
    return (
        <div className="app">
            <header className="header">
                <h1 className="logo">⚡ SolSwap</h1>
                <div className="wallet-badge">
                    <span className="wallet-dot" />
                    {shortAddr(user.walletAddress)}
                    {user.solBalance !== null && (
                        <span className="wallet-bal">
                            {user.solBalance.toFixed(3)} SOL
                        </span>
                    )}
                </div>
            </header>

            <main className="swap-card">
                {/* ── You sell ── */}
                <div className="token-section">
                    <label className="token-label">You sell</label>
                    <div className="token-row">
                        <select
                            className="token-select"
                            value={inputToken.symbol}
                            onChange={(e) => {
                                const t = TOKENS.find((x) => x.symbol === e.target.value);
                                if (t) setInputToken(t);
                            }}
                        >
                            {TOKENS.map((t) => (
                                <option key={t.symbol} value={t.symbol}>
                                    {t.symbol}
                                </option>
                            ))}
                        </select>
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
                        <select
                            className="token-select"
                            value={outputToken.symbol}
                            onChange={(e) => {
                                const t = TOKENS.find((x) => x.symbol === e.target.value);
                                if (t) setOutputToken(t);
                            }}
                        >
                            {TOKENS.map((t) => (
                                <option key={t.symbol} value={t.symbol}>
                                    {t.symbol}
                                </option>
                            ))}
                        </select>
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
                {quote && (
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

                {quoteError && <div className="error-msg">❌ {quoteError}</div>}

                {/* ── Swap button ── */}
                <button
                    className="swap-btn"
                    disabled={!quote || swapStatus === "building" || swapStatus === "opening"}
                    onClick={handleSwap}
                >
                    {swapStatus === "building"
                        ? "⏳ Building transaction..."
                        : swapStatus === "opening"
                            ? "🔓 Opening Phantom..."
                            : swapStatus === "done"
                                ? "✅ Sent! Sign in Phantom"
                                : swapStatus === "error"
                                    ? "❌ Failed — Try Again"
                                    : quote
                                        ? `🔄 Swap ${amount} ${inputToken.symbol} → ${outputToken.symbol}`
                                        : "Enter an amount"}
                </button>

                {swapStatus === "done" && (
                    <div className="sign-hint">
                        <p>
                            Phantom should open now. <strong>Approve the transaction</strong>{" "}
                            to complete your swap.
                        </p>
                        <button
                            className="reset-btn"
                            onClick={() => {
                                setSwapStatus("idle");
                                setAmount("");
                                setQuote(null);
                            }}
                        >
                            New Swap
                        </button>
                    </div>
                )}

                {swapStatus === "error" && (
                    <button
                        className="reset-btn"
                        onClick={() => setSwapStatus("idle")}
                    >
                        Try Again
                    </button>
                )}
            </main>

            <footer className="footer">
                🔒 Non-custodial · Your keys, your coins · 0.5% fee
            </footer>
        </div>
    );
}
