import { useState, useEffect, useCallback, useRef } from "react";
import { useWallets, useSignAndSendTransaction } from "@privy-io/react-auth/solana";
import {
    TokenInfo,
    TokenBalance,
    QuoteDisplay,
    fetchQuote,
    fetchSwapTransaction,
    fetchPopularTokens,
    fetchHistory,
    confirmSwap,
    fetchSwapStatus,
    SwapRecord,
    fetchCrossChainQuote,
    CrossChainQuoteResult,
} from "../lib/api";
import { CC_CHAINS, CC_TOKENS, TOKEN_META, ChainId } from "../lib/chains";
import { TokenSelector } from "../TokenSelector";
import { CcTokenModal } from "./CcTokenModal";
import { toast } from "../lib/toast";

const tg = (window as any).Telegram?.WebApp;

const RECENT_TOKENS_KEY = "solswap_recent_tokens";
function loadRecentTokens(): TokenInfo[] {
    try { return JSON.parse(localStorage.getItem(RECENT_TOKENS_KEY) || "[]"); } catch { return []; }
}
function saveRecentToken(token: TokenInfo): void {
    const existing = loadRecentTokens().filter((t) => t.mint !== token.mint);
    localStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify([token, ...existing].slice(0, 5)));
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

interface SwapPanelProps {
    walletAddress: string;
    tokenBalances: TokenBalance[];
    balancesLoaded: boolean;
    refreshBalance: () => void;
    slippageBps: number;
    onOpenSettings: () => void;
}

/** Max age for a quote before we force a re-fetch (H3/H4) */
const QUOTE_MAX_AGE_MS = 30_000;

export function SwapPanel({
    walletAddress,
    tokenBalances,
    balancesLoaded,
    refreshBalance,
    slippageBps,
    onOpenSettings,
}: SwapPanelProps) {
    const { wallets } = useWallets();
    const { signAndSendTransaction } = useSignAndSendTransaction();
    const embeddedWallet = wallets.length > 0 ? wallets[0] : null;

    // Polling ref for swap confirmation
    const confirmPollRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const quoteAbortRef = useRef<AbortController | null>(null);
    const ccAbortRef = useRef<AbortController | null>(null);

    // Cross-chain mode state
    const [crossChainMode, setCrossChainMode] = useState(false);
    const [ccInputChain, setCcInputChain] = useState<ChainId>("solana");
    const [ccOutputChain, setCcOutputChain] = useState<ChainId>("ethereum");
    const [ccInputSymbol, setCcInputSymbol] = useState("SOL");
    const [ccOutputSymbol, setCcOutputSymbol] = useState("ETH");
    const [ccAmount, setCcAmount] = useState("");
    const [ccQuote, setCcQuote] = useState<CrossChainQuoteResult | null>(null);
    const [ccLoading, setCcLoading] = useState(false);
    const [ccError, setCcError] = useState("");
    const [ccTokenModalSide, setCcTokenModalSide] = useState<"input" | "output" | null>(null);

    // Token loading
    const [tokensLoaded, setTokensLoaded] = useState(false);
    const [inputToken, setInputToken] = useState<TokenInfo | null>(null);
    const [outputToken, setOutputToken] = useState<TokenInfo | null>(null);
    const [recentTokens, setRecentTokens] = useState<TokenInfo[]>(loadRecentTokens);

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
            .catch(() => setTokensLoaded(true));
    }, []);

    // Token selector modal state
    const [selectorOpen, setSelectorOpen] = useState<"input" | "output" | null>(null);

    const [amount, setAmount] = useState("");

    // Quote state — snapshot of the inputs the quote was fetched for (H3)
    const [quote, setQuote] = useState<{
        raw: any;
        display: QuoteDisplay;
        fetchedAt: number;
        forAmount: string;
        forInputMint: string;
        forOutputMint: string;
    } | null>(null);
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

    /** Get the user's balance for a specific token mint. */
    const getTokenBalance = (mint: string): number | null => {
        const entry = tokenBalances.find((b) => b.mint === mint);
        if (entry) return entry.amount;
        if (balancesLoaded) return 0;
        return null;
    };

    // Fetch quote when inputs change (debounced) — with AbortController (H3)
    const getQuote = useCallback(async () => {
        quoteAbortRef.current?.abort();

        if (!inputToken || !outputToken || !amount || Number(amount) <= 0) {
            setQuote(null);
            return;
        }

        const controller = new AbortController();
        quoteAbortRef.current = controller;

        setQuoteLoading(true);
        setQuoteError("");

        const snapshotAmount = amount;
        const snapshotInputMint = inputToken.mint;
        const snapshotOutputMint = outputToken.mint;

        try {
            const result = await fetchQuote({
                inputMint: snapshotInputMint,
                outputMint: snapshotOutputMint,
                humanAmount: snapshotAmount,
                slippageBps,
            });

            if (controller.signal.aborted) return;

            setQuote({
                raw: result.quote,
                display: result.display,
                fetchedAt: Date.now(),
                forAmount: snapshotAmount,
                forInputMint: snapshotInputMint,
                forOutputMint: snapshotOutputMint,
            });
        } catch (err) {
            if (controller.signal.aborted) return;
            setQuoteError(err instanceof Error ? err.message : "Failed to get quote");
            setQuote(null);
        } finally {
            if (!controller.signal.aborted) {
                setQuoteLoading(false);
            }
        }
    }, [inputToken, outputToken, amount, slippageBps]);

    useEffect(() => {
        const timer = setTimeout(getQuote, 600);
        return () => clearTimeout(timer);
    }, [getQuote]);

    // Auto-refresh quotes that are about to expire (H4)
    useEffect(() => {
        if (!quote) return;
        const age = Date.now() - quote.fetchedAt;
        const remaining = QUOTE_MAX_AGE_MS - age;
        if (remaining <= 0) {
            getQuote();
            return;
        }
        const timer = setTimeout(getQuote, remaining);
        return () => clearTimeout(timer);
    }, [quote, getQuote]);

    // Cross-chain quote fetch (debounced, with AbortController)
    const getCrossChainQuote = useCallback(async () => {
        ccAbortRef.current?.abort();
        if (!ccAmount || Number(ccAmount) <= 0) {
            setCcQuote(null);
            return;
        }
        const controller = new AbortController();
        ccAbortRef.current = controller;
        setCcLoading(true);
        setCcError("");
        try {
            const result = await fetchCrossChainQuote({
                inputToken: ccInputSymbol,
                outputToken: ccOutputSymbol,
                inputChain: ccInputChain,
                outputChain: ccOutputChain,
                amount: ccAmount,
                slippageBps,
            });
            if (controller.signal.aborted) return;
            if (result.error) {
                setCcError(result.error);
                setCcQuote(null);
            } else {
                setCcQuote(result);
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            setCcError(err instanceof Error ? err.message : "Failed to get quote");
            setCcQuote(null);
        } finally {
            if (!controller.signal.aborted) setCcLoading(false);
        }
    }, [ccInputSymbol, ccOutputSymbol, ccInputChain, ccOutputChain, ccAmount, slippageBps]);

    useEffect(() => {
        if (!crossChainMode) return;
        const timer = setTimeout(getCrossChainQuote, 700);
        return () => clearTimeout(timer);
    }, [crossChainMode, getCrossChainQuote]);

    // Flip tokens
    const flipTokens = () => {
        const temp = inputToken;
        setInputToken(outputToken);
        setOutputToken(temp);
        setAmount("");
        setQuote(null);
    };

    // Clean up polling and in-flight requests on unmount
    useEffect(() => {
        return () => {
            if (confirmPollRef.current) clearInterval(confirmPollRef.current);
            ccAbortRef.current?.abort();
        };
    }, []);

    // Check if the user has enough balance for the swap
    const insufficientBalance = (() => {
        if (!inputToken || !amount || Number(amount) <= 0) return false;
        const bal = getTokenBalance(inputToken.mint);
        if (bal === null) return false;
        return Number(amount) > bal;
    })();

    // Execute swap
    const handleSwap = async () => {
        if (!walletAddress || !quote || !embeddedWallet || !inputToken || !outputToken) return;

        tg?.HapticFeedback?.impactOccurred("medium");

        // H3: Verify the quote matches the current inputs
        if (
            quote.forAmount !== amount ||
            quote.forInputMint !== inputToken.mint ||
            quote.forOutputMint !== outputToken.mint
        ) {
            setSwapError("Quote is outdated. A new quote is loading — please wait.");
            setSwapStatus("error");
            return;
        }

        // H4: Reject quotes older than 30s
        if (Date.now() - quote.fetchedAt > QUOTE_MAX_AGE_MS) {
            setSwapError("Quote expired. Fetching a fresh quote...");
            setSwapStatus("error");
            getQuote();
            return;
        }

        // Pre-flight balance check
        const bal = getTokenBalance(inputToken.mint);
        if (bal !== null && Number(amount) > bal) {
            setSwapError(
                `Insufficient ${inputToken.symbol} balance. You have ${bal < 0.001 ? "<0.001" : bal.toFixed(bal < 1 ? 6 : 4)} ${inputToken.symbol} but tried to swap ${amount}.`
            );
            setSwapStatus("error");
            return;
        }

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

            // Record swap in DB and start backend confirmation polling
            try {
                const { swapId } = await confirmSwap({
                    txSignature: sigString,
                    inputMint: inputToken.mint,
                    outputMint: outputToken.mint,
                    inputAmount: quote.raw.inAmount,
                    outputAmount: quote.raw.outAmount,
                    feeAmountUsd: quote.display.feeUsd,
                });

                if (confirmPollRef.current) clearInterval(confirmPollRef.current);
                let pollCount = 0;
                confirmPollRef.current = setInterval(async () => {
                    pollCount++;
                    try {
                        const result = await fetchSwapStatus(swapId);
                        if (result.status === "CONFIRMED") {
                            clearInterval(confirmPollRef.current);
                            setSwapStatus("done");
                            refreshBalance();
                            tg?.HapticFeedback?.notificationOccurred("success");
                            toast("Swap confirmed!", "success");
                        } else if (result.status === "FAILED") {
                            clearInterval(confirmPollRef.current);
                            setSwapError("Transaction failed on-chain");
                            setSwapStatus("error");
                            tg?.HapticFeedback?.notificationOccurred("error");
                            toast("Transaction failed on-chain", "error");
                        } else if (result.status === "TIMEOUT") {
                            // H10: Backend couldn't confirm within ~5 min
                            clearInterval(confirmPollRef.current);
                            setSwapStatus("done");
                            refreshBalance();
                            tg?.HapticFeedback?.notificationOccurred("success");
                            toast("Swap submitted!", "success");
                        }
                    } catch {
                        // Polling error — keep trying
                    }
                    if (pollCount >= 40) {
                        clearInterval(confirmPollRef.current);
                        setSwapStatus("done");
                        refreshBalance();
                    }
                }, 3000);
            } catch (confirmErr) {
                console.error("Failed to record swap:", confirmErr);
                setSwapStatus("done");
                refreshBalance();
            }
        } catch (err) {
            console.error("Swap error:", err);
            const errMsg = err instanceof Error ? err.message : "Transaction failed";
            setSwapError(errMsg);
            setSwapStatus("error");
            tg?.HapticFeedback?.notificationOccurred("error");
            toast(errMsg, "error");
        }
    };

    // Load swap history
    const loadHistory = async () => {
        try {
            const data = await fetchHistory();
            setHistory(data);
            setShowHistory(true);
        } catch (err) {
            console.error("Failed to load history:", err);
        }
    };

    const formatUsd = (v: number | null) =>
        v !== null ? `$${v.toFixed(2)}` : "";
    const formatRate = (r: number) =>
        r < 0.01
            ? r.toPrecision(4)
            : r < 1
                ? r.toFixed(6)
                : r.toFixed(r > 100 ? 0 : 2);

    const renderTokenButton = (token: TokenInfo | null, side: "input" | "output") => (
        <button className="token-btn" onClick={() => setSelectorOpen(side)}>
            {token?.icon && (
                <img
                    className="token-btn-icon"
                    src={token.icon}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
            )}
            <span className="token-btn-symbol">{token?.symbol ?? "Select"}</span>
            <span className="token-btn-arrow">▼</span>
        </button>
    );

    if (!tokensLoaded) {
        return (
            <div className="panel-loading">
                <div className="spinner" />
                <p>Loading tokens...</p>
            </div>
        );
    }

    return (
        <div className="swap-panel">
            <div className="panel-header">
                <h2 className="panel-title">Swap</h2>
                <div className="panel-header-right">
                    <button className="slippage-indicator" onClick={onOpenSettings} title="Adjust slippage in Settings">
                        ⚙️ {(slippageBps / 100).toFixed(1)}%
                    </button>
                    <button
                        className={`cc-toggle-btn${crossChainMode ? " cc-toggle-btn--active" : ""}`}
                        onClick={() => {
                            setCrossChainMode((v) => !v);
                            setCcQuote(null);
                            setCcError("");
                        }}
                        title={crossChainMode ? "Return to Solana swap" : "Bridge tokens across blockchains"}
                    >
                        {crossChainMode ? "◎ Solana swap" : "🌐 Cross-chain"}
                    </button>
                    <button className="history-link-btn" onClick={loadHistory}>
                        History
                    </button>
                </div>
            </div>

            {/* ── Recent Tokens ── */}
            {recentTokens.length > 0 && (
                <div className="recent-tokens">
                    <span className="recent-tokens-label">Recent</span>
                    {recentTokens.slice(0, 4).map((token) => (
                        <button
                            key={token.mint}
                            className="recent-token-chip"
                            onClick={() => {
                                if (outputToken?.mint === token.mint) setOutputToken(inputToken);
                                setInputToken(token);
                                saveRecentToken(token);
                                setRecentTokens(loadRecentTokens());
                                setQuote(null);
                            }}
                        >
                            {token.icon && (
                                <img
                                    className="recent-token-icon"
                                    src={token.icon}
                                    alt=""
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                            )}
                            {token.symbol}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Cross-chain mode ── */}
            {crossChainMode && (
                <div className="cc-panel">
                    {/* Banner */}
                    <div className="cc-banner">
                        <span className="cc-banner-title">🌉 Cross-Chain Bridge</span>
                        <span className="cc-banner-sub">Bridge tokens across blockchains via LI.FI</span>
                    </div>

                    {/* You Pay section */}
                    <div className="cc-section">
                        <span className="cc-section-label">You Pay</span>
                        <div className="cc-pickers-row">
                            <select
                                className="cc-chain-select"
                                value={ccInputChain}
                                onChange={(e) => {
                                    const chain = e.target.value as ChainId;
                                    setCcInputChain(chain);
                                    setCcInputSymbol(CC_TOKENS[chain][0].symbol);
                                    setCcQuote(null);
                                }}
                            >
                                {CC_CHAINS.map((c) => (
                                    <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                                ))}
                            </select>
                            <button
                                className="cc-token-btn"
                                onClick={() => setCcTokenModalSide("input")}
                            >
                                <span className="cc-token-btn-emoji">{TOKEN_META[ccInputSymbol]?.emoji ?? "🪙"}</span>
                                <span className="cc-token-btn-symbol">{ccInputSymbol}</span>
                                <span className="cc-token-btn-arrow">▼</span>
                            </button>
                        </div>
                        <input
                            className="cc-amount-input"
                            type="number"
                            placeholder="0.0"
                            value={ccAmount}
                            onChange={(e) => { setCcAmount(e.target.value); setCcQuote(null); }}
                            min="0"
                            step="any"
                            inputMode="decimal"
                        />
                    </div>

                    {/* Flip chains */}
                    <button
                        className="cc-flip-btn"
                        onClick={() => {
                            const tempChain = ccInputChain;
                            const tempSymbol = ccInputSymbol;
                            setCcInputChain(ccOutputChain);
                            setCcInputSymbol(ccOutputSymbol);
                            setCcOutputChain(tempChain);
                            setCcOutputSymbol(tempSymbol);
                            setCcAmount("");
                            setCcQuote(null);
                        }}
                        aria-label="Flip chains"
                    >
                        ⇅
                    </button>

                    {/* You Receive section */}
                    <div className="cc-section">
                        <span className="cc-section-label">You Receive</span>
                        <div className="cc-pickers-row">
                            <select
                                className="cc-chain-select"
                                value={ccOutputChain}
                                onChange={(e) => {
                                    const chain = e.target.value as ChainId;
                                    setCcOutputChain(chain);
                                    setCcOutputSymbol(CC_TOKENS[chain][0].symbol);
                                    setCcQuote(null);
                                }}
                            >
                                {CC_CHAINS.map((c) => (
                                    <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                                ))}
                            </select>
                            <button
                                className="cc-token-btn"
                                onClick={() => setCcTokenModalSide("output")}
                            >
                                <span className="cc-token-btn-emoji">{TOKEN_META[ccOutputSymbol]?.emoji ?? "🪙"}</span>
                                <span className="cc-token-btn-symbol">{ccOutputSymbol}</span>
                                <span className="cc-token-btn-arrow">▼</span>
                            </button>
                        </div>
                        <div className="cc-output-display">
                            {ccLoading ? (
                                <span className="pulse">Fetching...</span>
                            ) : ccQuote ? (
                                (() => {
                                    const outDecimals = CC_TOKENS[ccOutputChain].find(
                                        (t) => t.symbol === ccOutputSymbol
                                    )?.decimals ?? 6;
                                    const raw = BigInt(ccQuote.outputAmount || "0");
                                    const human = Number(raw) / 10 ** outDecimals;
                                    return human > 0 ? human.toPrecision(6) : "—";
                                })()
                            ) : (
                                <span style={{ color: "var(--text-muted)" }}>—</span>
                            )}
                        </div>
                    </div>

                    {ccError && <div className="cc-error">{ccError}</div>}

                    {/* Quote breakdown */}
                    {ccQuote && !ccQuote.error && (
                        <div className="cc-breakdown">
                            {ccQuote.outputAmountUsd && Number(ccQuote.outputAmountUsd) > 0 && (
                                <div className="cc-breakdown-row">
                                    <span>You receive ~</span>
                                    <span>${Number(ccQuote.outputAmountUsd).toFixed(2)}</span>
                                </div>
                            )}
                            {Number(ccQuote.feeUsd) > 0 && (
                                <div className="cc-breakdown-row">
                                    <span>Bridge fee</span>
                                    <span>~${Number(ccQuote.feeUsd).toFixed(2)}</span>
                                </div>
                            )}
                            {ccQuote.estimatedTimeSeconds > 0 && (
                                <div className="cc-breakdown-row">
                                    <span>Est. time</span>
                                    <span>
                                        {ccQuote.estimatedTimeSeconds < 60
                                            ? `${ccQuote.estimatedTimeSeconds}s`
                                            : `~${Math.ceil(ccQuote.estimatedTimeSeconds / 60)} min`}
                                    </span>
                                </div>
                            )}
                            <div className="cc-bridge-badge">
                                🌉 {ccQuote.isCrossChain ? "Cross-chain via LI.FI Bridge" : "⚡ Best route via Jupiter"}
                            </div>
                        </div>
                    )}

                    {/* Bridge button */}
                    <button
                        className="swap-btn"
                        disabled={!ccQuote || ccLoading || !ccAmount}
                        onClick={() => toast("Cross-chain bridging execution coming in Phase 3. Quote shown above.", "info")}
                    >
                        {ccLoading
                            ? "Getting quote..."
                            : !ccAmount || Number(ccAmount) <= 0
                                ? "Enter an amount"
                                : ccQuote
                                    ? `Bridge ${ccAmount} ${ccInputSymbol} → ${ccOutputSymbol} (Phase 3)`
                                    : "Enter an amount"}
                    </button>
                    {ccQuote && (
                        <div className="cc-phase-note">
                            ℹ️ Cross-chain bridging execution arrives in Phase 3. Quote shown for reference.
                        </div>
                    )}
                </div>
            )}

            {/* ── Same-chain swap card (hidden when cross-chain mode is active) ── */}
            {!crossChainMode && <div className="swap-card">
                {/* ── You sell ── */}
                <div className="token-section">
                    <label className="token-label">You pay</label>
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
                    <div className="token-balance-row">
                        {inputToken && (() => {
                            const bal = getTokenBalance(inputToken.mint);
                            if (bal === null) return null;
                            const isSOL = inputToken.mint === "So11111111111111111111111111111111111111112";
                            return (
                                <>
                                    <span className="usd-value">
                                        Balance: {bal < 0.001 ? "<0.001" : bal.toFixed(bal < 1 ? 6 : 4)} {inputToken.symbol}
                                    </span>
                                    <button
                                        className="max-btn"
                                        onClick={() => {
                                            const maxAmount = isSOL ? Math.max(0, bal - 0.01) : bal;
                                            setAmount(maxAmount > 0 ? String(maxAmount) : "");
                                            setSwapStatus("idle");
                                        }}
                                    >
                                        MAX
                                    </button>
                                </>
                            );
                        })()}
                        {quote?.display.inputUsd != null && (
                            <span className="usd-value" style={{ marginLeft: "auto" }}>
                                ~{formatUsd(quote.display.inputUsd)}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Flip ── */}
                <button className="flip-btn" onClick={flipTokens} aria-label="Swap direction">
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
                        <span className="usd-value">~{formatUsd(quote.display.outputUsd)}</span>
                    )}
                </div>

                {/* ── Quote breakdown ── */}
                {quote && inputToken && outputToken && (
                    <div className="breakdown">
                        <div className="breakdown-row">
                            <span>Rate</span>
                            <span>
                                1 {inputToken.symbol} = {formatRate(quote.display.exchangeRate)} {outputToken.symbol}
                            </span>
                        </div>
                        <div className="breakdown-row">
                            <span>Fee (0.5%)</span>
                            <span>
                                {quote.display.feeAmount} {outputToken.symbol}
                                {quote.display.feeUsd != null && ` (~${formatUsd(quote.display.feeUsd)})`}
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
                        <div className="breakdown-route">⚡ Best route via Jupiter</div>
                    </div>
                )}

                {quoteError && <div className="error-msg">{quoteError}</div>}

                {/* ── Swap button ── */}
                <button
                    className="swap-btn"
                    disabled={
                        !quote ||
                        insufficientBalance ||
                        swapStatus === "building" ||
                        swapStatus === "signing" ||
                        swapStatus === "confirming"
                    }
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
                                        : insufficientBalance
                                            ? `Insufficient ${inputToken?.symbol ?? ""} balance`
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
                                refreshBalance();
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
            </div>}

            {/* ── Cross-chain Token Modal ── */}
            <CcTokenModal
                open={ccTokenModalSide !== null}
                onClose={() => setCcTokenModalSide(null)}
                onSelect={(chain, symbol) => {
                    if (ccTokenModalSide === "input") {
                        setCcInputChain(chain);
                        setCcInputSymbol(symbol);
                    } else {
                        setCcOutputChain(chain);
                        setCcOutputSymbol(symbol);
                    }
                    setCcQuote(null);
                    setCcTokenModalSide(null);
                }}
                currentChain={ccTokenModalSide === "input" ? ccInputChain : ccOutputChain}
                currentSymbol={ccTokenModalSide === "input" ? ccInputSymbol : ccOutputSymbol}
            />

            {/* ── Token Selector Modal ── */}
            <TokenSelector
                open={selectorOpen !== null}
                onClose={() => setSelectorOpen(null)}
                onSelect={(token) => {
                    if (selectorOpen === "input") {
                        if (outputToken && token.mint === outputToken.mint) setOutputToken(inputToken);
                        setInputToken(token);
                    } else {
                        if (inputToken && token.mint === inputToken.mint) setInputToken(outputToken);
                        setOutputToken(token);
                    }
                    saveRecentToken(token);
                    setRecentTokens(loadRecentTokens());
                    setQuote(null);
                }}
                excludeMint={selectorOpen === "input" ? outputToken?.mint : inputToken?.mint}
            />

            {/* ── History Panel ── */}
            {showHistory && (
                <div className="history-overlay" onClick={() => setShowHistory(false)}>
                    <div className="history-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="history-header">
                            <h3>Swap History</h3>
                            <button className="history-close" onClick={() => setShowHistory(false)}>×</button>
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
        </div>
    );
}
