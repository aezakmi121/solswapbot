import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import {
    TokenInfo,
    QuoteDisplay,
    fetchTokens,
    fetchQuote,
    fetchSwapTransaction,
} from "./lib/api";

export function App() {
    const { publicKey, signTransaction, connected } = useWallet();
    const { connection } = useConnection();

    // Token list
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [inputToken, setInputToken] = useState<TokenInfo | null>(null);
    const [outputToken, setOutputToken] = useState<TokenInfo | null>(null);
    const [amount, setAmount] = useState("");

    // Quote state
    const [quote, setQuote] = useState<{ raw: unknown; display: QuoteDisplay } | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState("");

    // Swap state
    const [swapStatus, setSwapStatus] = useState<"idle" | "building" | "signing" | "sending" | "confirmed" | "failed">("idle");
    const [txSignature, setTxSignature] = useState("");

    // Load tokens
    useEffect(() => {
        fetchTokens().then((t) => {
            setTokens(t);
            setInputToken(t.find((x) => x.symbol === "SOL") ?? t[0]);
            setOutputToken(t.find((x) => x.symbol === "USDC") ?? t[1]);
        });
    }, []);

    // Fetch quote when inputs change
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
        const timer = setTimeout(getQuote, 500); // Debounce
        return () => clearTimeout(timer);
    }, [getQuote]);

    // Swap tokens direction
    const flipTokens = () => {
        setInputToken(outputToken);
        setOutputToken(inputToken);
        setAmount("");
        setQuote(null);
    };

    // Execute swap
    const handleSwap = async () => {
        if (!publicKey || !signTransaction || !quote) return;

        try {
            setSwapStatus("building");

            const { swapTransaction } = await fetchSwapTransaction({
                quoteResponse: quote.raw,
                userPublicKey: publicKey.toBase58(),
            });

            setSwapStatus("signing");

            // Deserialize and sign the transaction
            const txBuffer = Buffer.from(swapTransaction, "base64");
            const transaction = VersionedTransaction.deserialize(txBuffer);
            const signed = await signTransaction(transaction);

            setSwapStatus("sending");

            // Send the signed transaction
            const signature = await connection.sendRawTransaction(signed.serialize(), {
                maxRetries: 3,
                skipPreflight: true,
            });

            setTxSignature(signature);

            // Wait for confirmation
            const confirmation = await connection.confirmTransaction(signature, "confirmed");

            if (confirmation.value.err) {
                setSwapStatus("failed");
            } else {
                setSwapStatus("confirmed");
            }
        } catch (err) {
            console.error("Swap failed:", err);
            setSwapStatus("failed");
        }
    };

    const formatUsd = (v: number | null) => (v !== null ? `$${v.toFixed(2)}` : "");
    const formatRate = (r: number) => r < 0.01 ? r.toPrecision(4) : r < 1 ? r.toFixed(6) : r.toFixed(2);

    return (
        <div className="app">
            <header className="header">
                <h1 className="logo">⚡ SolSwap</h1>
                <WalletMultiButton />
            </header>

            <main className="swap-card">
                {/* Input token */}
                <div className="token-section">
                    <label className="token-label">You sell</label>
                    <div className="token-row">
                        <select
                            className="token-select"
                            value={inputToken?.symbol ?? ""}
                            onChange={(e) => setInputToken(tokens.find((t) => t.symbol === e.target.value) ?? null)}
                        >
                            {tokens.map((t) => (
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
                            onChange={(e) => setAmount(e.target.value)}
                            min="0"
                            step="any"
                        />
                    </div>
                    {quote?.display.inputUsd && (
                        <span className="usd-value">~{formatUsd(quote.display.inputUsd)}</span>
                    )}
                </div>

                {/* Flip button */}
                <button className="flip-btn" onClick={flipTokens} aria-label="Swap direction">
                    ⇅
                </button>

                {/* Output token */}
                <div className="token-section">
                    <label className="token-label">You receive</label>
                    <div className="token-row">
                        <select
                            className="token-select"
                            value={outputToken?.symbol ?? ""}
                            onChange={(e) => setOutputToken(tokens.find((t) => t.symbol === e.target.value) ?? null)}
                        >
                            {tokens.map((t) => (
                                <option key={t.symbol} value={t.symbol}>
                                    {t.symbol}
                                </option>
                            ))}
                        </select>
                        <div className="output-amount">
                            {quoteLoading ? "..." : quote?.display.outputAmount ?? "0.0"}
                        </div>
                    </div>
                    {quote?.display.outputUsd && (
                        <span className="usd-value">~{formatUsd(quote.display.outputUsd)}</span>
                    )}
                </div>

                {/* Quote breakdown */}
                {quote && (
                    <div className="breakdown">
                        <div className="breakdown-row">
                            <span>Rate</span>
                            <span>1 {inputToken?.symbol} = {formatRate(quote.display.exchangeRate)} {outputToken?.symbol}</span>
                        </div>
                        <div className="breakdown-row">
                            <span>Platform fee (0.5%)</span>
                            <span>
                                {quote.display.feeAmount} {outputToken?.symbol}
                                {quote.display.feeUsd !== null && ` (~${formatUsd(quote.display.feeUsd)})`}
                            </span>
                        </div>
                        <div className="breakdown-row">
                            <span>Price impact</span>
                            <span>{quote.display.priceImpactPct < 0.01 ? "<0.01%" : `${quote.display.priceImpactPct.toFixed(2)}%`}</span>
                        </div>
                        <div className="breakdown-row">
                            <span>Slippage</span>
                            <span>{(quote.display.slippageBps / 100).toFixed(1)}%</span>
                        </div>
                        <div className="breakdown-route">
                            ⚡ Best route via Jupiter aggregator
                        </div>
                    </div>
                )}

                {quoteError && <div className="error-msg">❌ {quoteError}</div>}

                {/* Swap button */}
                <button
                    className="swap-btn"
                    disabled={!connected || !quote || swapStatus !== "idle"}
                    onClick={handleSwap}
                >
                    {!connected
                        ? "Connect Wallet"
                        : swapStatus === "building"
                            ? "Building transaction..."
                            : swapStatus === "signing"
                                ? "Sign in wallet..."
                                : swapStatus === "sending"
                                    ? "Confirming on-chain..."
                                    : swapStatus === "confirmed"
                                        ? "✅ Swap Complete!"
                                        : swapStatus === "failed"
                                            ? "❌ Swap Failed — Try Again"
                                            : quote
                                                ? "🔄 Swap Now"
                                                : "Enter an amount"}
                </button>

                {txSignature && (
                    <a
                        className="tx-link"
                        href={`https://solscan.io/tx/${txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        View on Solscan ↗
                    </a>
                )}

                {(swapStatus === "confirmed" || swapStatus === "failed") && (
                    <button
                        className="reset-btn"
                        onClick={() => {
                            setSwapStatus("idle");
                            setTxSignature("");
                            setAmount("");
                            setQuote(null);
                        }}
                    >
                        New Swap
                    </button>
                )}
            </main>

            <footer className="footer">
                Non-custodial · Your keys, your coins · 0.5% fee
            </footer>
        </div>
    );
}
