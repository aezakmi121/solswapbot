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
    executeCrossChain,
    confirmCrossChainSwap,
    getCrossChainBridgeStatus,
} from "../lib/api";
import { CC_CHAINS, CC_TOKENS, TOKEN_META, ChainId } from "../lib/chains";
import { TokenSelector } from "../TokenSelector";
import { CcTokenModal } from "./CcTokenModal";
import { toast } from "../lib/toast";

const SLIPPAGE_KEY = "solswap_slippage_bps";
const SLIPPAGE_OPTIONS = [
    { label: "0.1%", value: 10 },
    { label: "0.5%", value: 50 },
    { label: "1.0%", value: 100 },
];

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

/** Map raw Jupiter / LI.FI error strings to user-friendly messages. */
function friendlySwapError(raw: string): string {
    const r = raw.toLowerCase();
    if (/same.*mint|circular|arbitrage.*disabled/.test(r))
        return "Select two different tokens to swap";
    if (/no.*route|no liquidity|insufficient liquidity|no.*available/.test(r))
        return "No swap route found for this token pair";
    if (/slippage|price.*moved|price impact/.test(r))
        return "Price moved — try increasing your slippage tolerance";
    if (/insufficient.*balance|not enough/.test(r))
        return "Insufficient balance for this swap";
    if (/transaction.*expired|blockhash/.test(r))
        return "Transaction expired — please try again";
    return "Swap failed — please try again";
}

interface SwapPanelProps {
    walletAddress: string;
    tokenBalances: TokenBalance[];
    balancesLoaded: boolean;
    refreshBalance: () => void;
    slippageBps: number;
    onSlippageChange: (bps: number) => void;
}

/** Max age for a quote before we force a re-fetch (H3/H4) */
const QUOTE_MAX_AGE_MS = 30_000;

export function SwapPanel({
    walletAddress,
    tokenBalances,
    balancesLoaded,
    refreshBalance,
    slippageBps,
    onSlippageChange,
}: SwapPanelProps) {
    const { wallets } = useWallets();
    const { signAndSendTransaction } = useSignAndSendTransaction();
    const embeddedWallet = wallets.length > 0 ? wallets[0] : null;

    // Polling ref for swap confirmation
    const confirmPollRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const quoteAbortRef = useRef<AbortController | null>(null);
    const ccAbortRef = useRef<AbortController | null>(null);

    // Inline slippage section (expands below header, no absolute positioning)
    const [showSlippageInline, setShowSlippageInline] = useState(false);
    const [slippageCustomInput, setSlippageCustomInput] = useState("");
    const [showSlippageCustom, setShowSlippageCustom] = useState(false);

    const handleSlippageSelect = (bps: number) => {
        onSlippageChange(bps);
        localStorage.setItem(SLIPPAGE_KEY, String(bps));
        setShowSlippageCustom(false);
        setSlippageCustomInput("");
        setShowSlippageInline(false);
    };

    const handleCustomSlippage = () => {
        const val = parseFloat(slippageCustomInput);
        if (!isNaN(val) && val > 0 && val <= 50) {
            handleSlippageSelect(Math.round(val * 100));
        }
    };

    const isSlippagePreset = SLIPPAGE_OPTIONS.some((o) => o.value === slippageBps);

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

    // Bridge execution state
    const [bridgeStatus, setBridgeStatus] = useState<"idle" | "building" | "signing" | "bridging" | "done" | "error">("idle");
    const [bridgeError, setBridgeError] = useState("");
    const [bridgeTxSig, setBridgeTxSig] = useState<string | null>(null);
    const [bridgeToAddress, setBridgeToAddress] = useState("");
    const bridgePollRef = useRef<ReturnType<typeof setInterval>>(undefined);

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
            setQuoteError("");
            return;
        }

        // Same-token guard: Jupiter rejects circular swaps with a raw error; catch it early.
        if (inputToken.mint === outputToken.mint) {
            setQuoteError("Select two different tokens to swap");
            setQuote(null);
            setQuoteLoading(false);
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
            const raw = err instanceof Error ? err.message : "Failed to get quote";
            setQuoteError(friendlySwapError(raw));
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
        // Block same-chain non-Solana pairs — Jupiter can't handle EVM addresses
        if (ccInputChain === ccOutputChain && ccInputChain !== "solana") {
            setCcQuote(null);
            setCcError("");
            return;
        }
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
            if (bridgePollRef.current) clearInterval(bridgePollRef.current);
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
            const raw = err instanceof Error ? err.message : "Transaction failed";
            const errMsg = friendlySwapError(raw);
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

    // Execute a cross-chain bridge swap via LI.FI
    const handleBridgeExecute = async () => {
        if (!walletAddress || !ccQuote || !embeddedWallet) return;
        tg?.HapticFeedback?.impactOccurred("medium");

        const toAddr = ccOutputChain === "solana" ? walletAddress : bridgeToAddress.trim();
        if (ccOutputChain !== "solana" && !/^0x[a-fA-F0-9]{40}$/.test(toAddr)) {
            setBridgeError("Enter a valid EVM wallet address (starts with 0x)");
            return;
        }

        try {
            setBridgeStatus("building");
            setBridgeError("");
            setBridgeTxSig(null);

            const { transactionData, outputAmount, outputAmountUsd } = await executeCrossChain({
                inputToken: ccInputSymbol,
                outputToken: ccOutputSymbol,
                inputChain: ccInputChain,
                outputChain: ccOutputChain,
                amount: ccAmount,
                slippageBps,
                fromAddress: walletAddress,
                toAddress: toAddr,
            });

            setBridgeStatus("signing");
            const txBytes = Uint8Array.from(atob(transactionData), (c) => c.charCodeAt(0));
            const { signature } = await signAndSendTransaction({
                transaction: txBytes,
                wallet: embeddedWallet,
                chain: "solana:mainnet",
            });

            const sigStr = uint8ToBase58(signature);
            setBridgeTxSig(sigStr);
            setBridgeStatus("bridging");
            tg?.HapticFeedback?.notificationOccurred("success");
            toast("Bridge transaction submitted!", "info");

            // Record in DB (non-fatal if it fails)
            try {
                await confirmCrossChainSwap({
                    txSignature: sigStr,
                    inputToken: ccInputSymbol,
                    outputToken: ccOutputSymbol,
                    inputChain: ccInputChain,
                    outputChain: ccOutputChain,
                    inputAmount: ccAmount,
                    outputAmount: outputAmount,
                    feeAmountUsd: Number(outputAmountUsd) > 0 ? null : null,
                });
            } catch { /* non-fatal */ }

            // Poll LI.FI status every 5 s, give up after 60 attempts (~5 min)
            let polls = 0;
            bridgePollRef.current = setInterval(async () => {
                polls++;
                try {
                    const st = await getCrossChainBridgeStatus(sigStr, ccInputChain, ccOutputChain);
                    if (st.status === "DONE") {
                        clearInterval(bridgePollRef.current);
                        setBridgeStatus("done");
                        refreshBalance();
                        tg?.HapticFeedback?.notificationOccurred("success");
                        toast("Bridge complete! Funds arriving at destination.", "success");
                    } else if (st.status === "FAILED") {
                        clearInterval(bridgePollRef.current);
                        setBridgeError("Bridge transaction failed on-chain");
                        setBridgeStatus("error");
                        tg?.HapticFeedback?.notificationOccurred("error");
                    }
                } catch { /* keep polling on transient errors */ }
                if (polls >= 60) {
                    clearInterval(bridgePollRef.current);
                    // Show as done with explorer link — bridge is slow but likely in progress
                    setBridgeStatus("done");
                    refreshBalance();
                }
            }, 5000);
        } catch (err) {
            console.error("Bridge error:", err);
            const raw = err instanceof Error ? err.message : "Bridge failed";
            setBridgeError(raw);
            setBridgeStatus("error");
            tg?.HapticFeedback?.notificationOccurred("error");
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
                    <button
                        className={`slippage-indicator${showSlippageInline ? " slippage-indicator--active" : ""}`}
                        onClick={() => {
                            setShowSlippageInline((v) => !v);
                            setShowSlippageCustom(false);
                        }}
                        title="Set slippage tolerance"
                    >
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

            {/* ── Inline Slippage Section (in document flow — no overflow risk) ── */}
            {showSlippageInline && (
                <div className="slippage-inline">
                    <span className="slippage-inline-label">Slippage Tolerance</span>
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
                            className={`slippage-chip${!isSlippagePreset || showSlippageCustom ? " slippage-chip--active" : ""}`}
                            onClick={() => setShowSlippageCustom((v) => !v)}
                        >
                            {isSlippagePreset ? "Custom" : `${(slippageBps / 100).toFixed(2)}%`}
                        </button>
                    </div>
                    {showSlippageCustom && (
                        <div className="slippage-custom-row">
                            <input
                                className="slippage-custom-input"
                                type="number"
                                placeholder="e.g. 2.5"
                                min="0.01"
                                max="50"
                                step="0.1"
                                value={slippageCustomInput}
                                onChange={(e) => setSlippageCustomInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCustomSlippage()}
                                autoFocus
                            />
                            <span className="slippage-pct-label">%</span>
                            <button className="slippage-set-btn" onClick={handleCustomSlippage}>Set</button>
                        </div>
                    )}
                </div>
            )}

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
                        <span className="cc-banner-sub">Select tokens, enter amount, and get a live quote</span>
                    </div>

                    {/* Same-chain guard: block non-Solana same-chain pairs before making any API call */}
                    {ccInputChain === ccOutputChain && ccInputChain !== "solana" && (
                        <div className="cc-same-chain-warning">
                            ⚠️ Both sides are on <strong>{CC_CHAINS.find(c => c.id === ccInputChain)?.name ?? ccInputChain}</strong>.
                            {" "}Select a different destination network to bridge, or use the{" "}
                            <button
                                className="cc-same-chain-link"
                                onClick={() => setCrossChainMode(false)}
                            >
                                Solana swap
                            </button>
                            {" "}tab for same-chain swaps.
                        </div>
                    )}

                    {/* You Pay section */}
                    <div className="cc-section">
                        <div className="cc-section-header">
                            <span className="cc-section-label">You Pay</span>
                            <span className="cc-section-hint">Tap to choose token &amp; network</span>
                        </div>
                        {/* Single full-width token+chain button */}
                        <button
                            className="cc-token-btn cc-token-btn--full"
                            onClick={() => setCcTokenModalSide("input")}
                        >
                            <span className="cc-token-btn-chain-emoji">
                                {CC_CHAINS.find((c) => c.id === ccInputChain)?.emoji ?? "🔗"}
                            </span>
                            <div className="cc-token-btn-body">
                                <span className="cc-token-btn-symbol">
                                    {TOKEN_META[ccInputSymbol]?.emoji ?? "🪙"} {ccInputSymbol}
                                </span>
                                <span className="cc-token-btn-chain-name">
                                    on {CC_CHAINS.find((c) => c.id === ccInputChain)?.name ?? ccInputChain}
                                </span>
                            </div>
                            <span className="cc-token-btn-arrow">▼</span>
                        </button>
                        <input
                            className="cc-amount-input"
                            type="number"
                            placeholder="Enter amount to bridge"
                            value={ccAmount}
                            onChange={(e) => { setCcAmount(e.target.value); setCcQuote(null); }}
                            min="0"
                            step="any"
                            inputMode="decimal"
                        />
                    </div>

                    {/* Bridge direction arrow + flip */}
                    <div className="cc-bridge-arrow">
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
                            title="Flip direction"
                        >
                            ⇅
                        </button>
                        <span className="cc-bridge-arrow-label">Bridge</span>
                    </div>

                    {/* You Receive section */}
                    <div className="cc-section">
                        <div className="cc-section-header">
                            <span className="cc-section-label">You Receive</span>
                            <span className="cc-section-hint">Tap to choose destination</span>
                        </div>
                        {/* Single full-width token+chain button */}
                        <button
                            className="cc-token-btn cc-token-btn--full"
                            onClick={() => setCcTokenModalSide("output")}
                        >
                            <span className="cc-token-btn-chain-emoji">
                                {CC_CHAINS.find((c) => c.id === ccOutputChain)?.emoji ?? "🔗"}
                            </span>
                            <div className="cc-token-btn-body">
                                <span className="cc-token-btn-symbol">
                                    {TOKEN_META[ccOutputSymbol]?.emoji ?? "🪙"} {ccOutputSymbol}
                                </span>
                                <span className="cc-token-btn-chain-name">
                                    on {CC_CHAINS.find((c) => c.id === ccOutputChain)?.name ?? ccOutputChain}
                                </span>
                            </div>
                            <span className="cc-token-btn-arrow">▼</span>
                        </button>
                        <div className="cc-output-display">
                            {ccLoading ? (
                                <span className="pulse">Fetching quote…</span>
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
                                <span className="cc-output-placeholder">
                                    {ccAmount && Number(ccAmount) > 0 ? "Getting quote…" : "Enter amount above"}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Destination address input for EVM output chains */}
                    {ccOutputChain !== "solana" && bridgeStatus === "idle" && (
                        <div className="cc-to-address-row">
                            <label className="cc-to-address-label">Receive at (your EVM address)</label>
                            <input
                                className="cc-to-address-input"
                                type="text"
                                placeholder="0x..."
                                value={bridgeToAddress}
                                onChange={(e) => { setBridgeToAddress(e.target.value); setBridgeError(""); }}
                                spellCheck={false}
                                autoComplete="off"
                            />
                        </div>
                    )}

                    {/* EVM-origin guard */}
                    {ccInputChain !== "solana" && (
                        <div className="cc-evm-origin-warning">
                            Bridging from EVM chains is coming soon. Switch the <strong>You Pay</strong> side to a Solana token to bridge out.
                        </div>
                    )}

                    {ccError && <div className="cc-error">{ccError}</div>}

                    {/* Quote breakdown */}
                    {ccQuote && !ccQuote.error && bridgeStatus === "idle" && (
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
                    {bridgeStatus !== "done" && (
                        <button
                            className="swap-btn"
                            disabled={
                                !ccQuote || ccLoading || !ccAmount ||
                                ccInputChain !== "solana" ||
                                (ccInputChain === ccOutputChain && ccInputChain !== "solana") ||
                                bridgeStatus === "building" || bridgeStatus === "signing" || bridgeStatus === "bridging" ||
                                (ccOutputChain !== "solana" && !/^0x[a-fA-F0-9]{40}$/.test(bridgeToAddress.trim()))
                            }
                            onClick={handleBridgeExecute}
                        >
                            {bridgeStatus === "building"
                                ? "Building bridge transaction..."
                                : bridgeStatus === "signing"
                                    ? "Approve in wallet..."
                                    : bridgeStatus === "bridging"
                                        ? "Bridging — tracking status..."
                                        : bridgeStatus === "error"
                                            ? "Failed — Try Again"
                                            : ccLoading
                                                ? "Getting quote…"
                                                : !ccAmount || Number(ccAmount) <= 0
                                                    ? "Enter an amount to get a quote"
                                                    : ccInputChain !== "solana"
                                                        ? "EVM-origin bridges coming soon"
                                                        : ccQuote
                                                            ? `Bridge ${ccAmount} ${ccInputSymbol} → ${ccOutputSymbol}`
                                                            : "Enter an amount to get a quote"}
                        </button>
                    )}

                    {/* Bridge done state */}
                    {bridgeStatus === "done" && bridgeTxSig && (
                        <div className="sign-hint">
                            <p>Bridge transaction submitted. Funds will arrive at the destination chain shortly.</p>
                            <a
                                className="tx-link"
                                href={`https://solscan.io/tx/${bridgeTxSig}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View source tx on Solscan
                            </a>
                            <button
                                className="reset-btn"
                                onClick={() => {
                                    setBridgeStatus("idle");
                                    setBridgeError("");
                                    setBridgeTxSig(null);
                                    setBridgeToAddress("");
                                    setCcAmount("");
                                    setCcQuote(null);
                                }}
                            >
                                New Bridge
                            </button>
                        </div>
                    )}

                    {/* Bridge error state */}
                    {bridgeStatus === "error" && (
                        <div className="error-msg">
                            {bridgeError || "Bridge transaction failed"}
                            <button
                                className="reset-btn"
                                onClick={() => { setBridgeStatus("idle"); setBridgeError(""); }}
                            >
                                Try Again
                            </button>
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
