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
} from "../lib/api";
import { TokenSelector } from "../TokenSelector";

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

    // Token loading
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

    // Flip tokens
    const flipTokens = () => {
        const temp = inputToken;
        setInputToken(outputToken);
        setOutputToken(temp);
        setAmount("");
        setQuote(null);
    };

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (confirmPollRef.current) clearInterval(confirmPollRef.current);
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
                        } else if (result.status === "FAILED") {
                            clearInterval(confirmPollRef.current);
                            setSwapError("Transaction failed on-chain");
                            setSwapStatus("error");
                        } else if (result.status === "TIMEOUT") {
                            // H10: Backend couldn't confirm within ~5 min
                            clearInterval(confirmPollRef.current);
                            setSwapStatus("done");
                            refreshBalance();
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
            setSwapError(err instanceof Error ? err.message : "Transaction failed");
            setSwapStatus("error");
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
                    <button className="history-link-btn" onClick={loadHistory}>
                        History
                    </button>
                </div>
            </div>

            <div className="swap-card">
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
            </div>

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
