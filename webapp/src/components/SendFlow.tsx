import { useState } from "react";
import { useWallets, useSignAndSendTransaction } from "@privy-io/react-auth/solana";
import { PortfolioToken, fetchSendTransaction, confirmTransfer } from "../lib/api";
import { toast } from "../lib/toast";

interface SendFlowProps {
    portfolioTokens: PortfolioToken[];
    walletAddress: string;
    onClose: () => void;
    onSent?: () => void;
}

/** Convert a Uint8Array signature to base58 */
function uint8ToBase58(bytes: Uint8Array): string {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = BigInt(0);
    for (const byte of bytes) { num = num * 256n + BigInt(byte); }
    let str = "";
    while (num > 0n) { str = ALPHABET[Number(num % 58n)] + str; num = num / 58n; }
    for (const byte of bytes) { if (byte === 0) str = "1" + str; else break; }
    return str;
}

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_FEE_RESERVE = 0.01;

type Step = "select" | "details" | "confirm" | "sending" | "done" | "error";

function formatAmount(amount: number, decimals: number): string {
    if (amount === 0) return "0";
    const d = Math.min(decimals, amount < 1 ? 6 : 4);
    return amount.toLocaleString("en-US", { maximumFractionDigits: d });
}

export function SendFlow({ portfolioTokens, walletAddress, onClose, onSent }: SendFlowProps) {
    const { wallets } = useWallets();
    const { signAndSendTransaction } = useSignAndSendTransaction();
    const embeddedWallet = wallets.length > 0 ? wallets[0] : null;

    const [step, setStep] = useState<Step>("select");
    const [selectedToken, setSelectedToken] = useState<PortfolioToken | null>(null);
    const [recipient, setRecipient] = useState("");
    const [amount, setAmount] = useState("");
    const [txSig, setTxSig] = useState<string | null>(null);
    const [error, setError] = useState("");

    const sendableTokens = portfolioTokens.filter((t) => t.amount > 0);

    const maxAmount = selectedToken
        ? selectedToken.mint === WSOL_MINT
            ? Math.max(0, selectedToken.amount - SOL_FEE_RESERVE)
            : selectedToken.amount
        : 0;

    const amountNum = parseFloat(amount);
    const amountUsd =
        selectedToken?.priceUsd && !isNaN(amountNum)
            ? amountNum * selectedToken.priceUsd
            : null;

    const isValidRecipient = recipient.trim().length >= 32 && recipient.trim().length <= 44;
    const isValidAmount = !isNaN(amountNum) && amountNum > 0 && amountNum <= maxAmount;

    const handleSend = async () => {
        if (!selectedToken || !embeddedWallet) return;
        setStep("sending");
        setError("");
        try {
            const { transaction } = await fetchSendTransaction({
                tokenMint: selectedToken.mint,
                recipientAddress: recipient.trim(),
                amount: amountNum,
                senderAddress: walletAddress,
            });

            const txBytes = Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0));
            const { signature } = await signAndSendTransaction({
                transaction: txBytes,
                wallet: embeddedWallet,
                chain: "solana:mainnet",
            });

            const sig = uint8ToBase58(signature);
            setTxSig(sig);

            // Fire-and-forget: record the send in the DB for activity history
            confirmTransfer({
                txSignature: sig,
                tokenMint: selectedToken.mint,
                tokenSymbol: selectedToken.symbol,
                humanAmount: amount,
                recipientAddress: recipient.trim(),
            }).catch((err) => console.error("Failed to record transfer:", err));

            setStep("done");
            toast("Transaction sent!", "success");
            onSent?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Transaction failed");
            setStep("error");
        }
    };

    const handlePaste = async () => {
        const text = await navigator.clipboard.readText().catch(() => "");
        if (text) setRecipient(text.trim());
    };

    const title = {
        select: "Send",
        details: `Send ${selectedToken?.symbol ?? ""}`,
        confirm: "Confirm Send",
        sending: "Sending...",
        done: "Sent!",
        error: "Send Failed",
    }[step];

    return (
        <div className="send-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="send-sheet">
                <div className="send-header">
                    <h3 className="send-title">{title}</h3>
                    <button className="send-close" onClick={onClose}>✕</button>
                </div>

                {/* ── Step 1: Select Token ── */}
                {step === "select" && (
                    <div className="send-step">
                        {sendableTokens.length === 0 ? (
                            <div className="send-empty">No tokens to send.</div>
                        ) : (
                            sendableTokens.map((token) => (
                                <button
                                    key={token.mint}
                                    className="send-token-row"
                                    onClick={() => { setSelectedToken(token); setStep("details"); }}
                                >
                                    <div className="portfolio-token-icon-wrap">
                                        {token.icon
                                            ? <img className="portfolio-token-icon" src={token.icon} alt={token.symbol} />
                                            : <div className="portfolio-token-icon-placeholder">{token.symbol.slice(0, 2)}</div>
                                        }
                                    </div>
                                    <div className="portfolio-token-info">
                                        <span className="portfolio-token-symbol">{token.symbol}</span>
                                        <span className="portfolio-token-name">{token.name}</span>
                                    </div>
                                    <div className="portfolio-token-values">
                                        <span className="portfolio-token-amount">
                                            {formatAmount(token.amount, token.decimals)}
                                        </span>
                                        {token.valueUsd !== null && (
                                            <span className="portfolio-token-usd">
                                                ${token.valueUsd.toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                )}

                {/* ── Step 2: Enter Details ── */}
                {step === "details" && selectedToken && (
                    <div className="send-step">
                        <div className="send-field">
                            <label className="send-field-label">To</label>
                            <div className="send-addr-row">
                                <input
                                    className="send-input"
                                    type="text"
                                    placeholder="Recipient address"
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                />
                                <button className="send-paste-btn" onClick={handlePaste} title="Paste">
                                    📋
                                </button>
                            </div>
                        </div>
                        <div className="send-field">
                            <label className="send-field-label">Amount</label>
                            <div className="send-amount-row">
                                <input
                                    className="send-input"
                                    type="number"
                                    placeholder="0.00"
                                    min="0"
                                    step="any"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                                <button
                                    className="send-max-btn"
                                    onClick={() => setAmount(String(maxAmount))}
                                >
                                    MAX
                                </button>
                            </div>
                            <div className="send-balance-hint">
                                Balance: {formatAmount(selectedToken.amount, selectedToken.decimals)} {selectedToken.symbol}
                                {selectedToken.mint === WSOL_MINT && (
                                    <span className="send-reserve-hint"> (0.01 SOL reserved for fees)</span>
                                )}
                            </div>
                            {amountUsd !== null && (
                                <div className="send-usd-hint">≈ ${amountUsd.toFixed(2)}</div>
                            )}
                        </div>
                        <button
                            className="swap-btn"
                            disabled={!isValidRecipient || !isValidAmount}
                            onClick={() => setStep("confirm")}
                        >
                            Continue →
                        </button>
                        <button className="send-back-btn" onClick={() => setStep("select")}>
                            ← Back
                        </button>
                    </div>
                )}

                {/* ── Step 3: Confirm ── */}
                {step === "confirm" && selectedToken && (
                    <div className="send-step">
                        <div className="send-confirm-card">
                            <div className="send-confirm-label">Sending</div>
                            <div className="send-confirm-amount">
                                {amount} {selectedToken.symbol}
                                {amountUsd !== null && (
                                    <span className="send-confirm-usd"> (~${amountUsd.toFixed(2)})</span>
                                )}
                            </div>
                            <div className="send-confirm-divider" />
                            <div className="send-confirm-label">To</div>
                            <div className="send-confirm-addr">
                                {recipient.slice(0, 8)}...{recipient.slice(-8)}
                            </div>
                            <div className="send-confirm-fee">
                                Network fee: ~0.000005 SOL
                            </div>
                        </div>
                        <button className="swap-btn" onClick={handleSend}>
                            Confirm &amp; Send
                        </button>
                        <button className="send-back-btn" onClick={() => setStep("details")}>
                            ← Back
                        </button>
                    </div>
                )}

                {/* ── Sending ── */}
                {step === "sending" && (
                    <div className="send-status">
                        <div className="spinner" />
                        <p>Sending transaction...</p>
                    </div>
                )}

                {/* ── Done ── */}
                {step === "done" && (
                    <div className="send-status send-status--done">
                        <div className="send-status-icon">✅</div>
                        <p>Transaction sent!</p>
                        {txSig && (
                            <a
                                href={`https://solscan.io/tx/${txSig}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="solscan-link"
                            >
                                View on Solscan ↗
                            </a>
                        )}
                        <button className="swap-btn" style={{ marginTop: 16 }} onClick={onClose}>
                            Done
                        </button>
                    </div>
                )}

                {/* ── Error ── */}
                {step === "error" && (
                    <div className="send-status send-status--error">
                        <div className="send-status-icon">❌</div>
                        <p className="send-error-msg">{error || "Transaction failed"}</p>
                        <button className="swap-btn" onClick={() => { setStep("confirm"); setError(""); }}>
                            Try Again
                        </button>
                        <button className="send-back-btn" onClick={onClose}>
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
