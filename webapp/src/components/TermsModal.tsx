import { useState } from "react";

const TERMS_KEY = "solswap_terms_accepted";

export function hasAcceptedTerms(): boolean {
    return localStorage.getItem(TERMS_KEY) === "1";
}

interface TermsModalProps {
    onAccept: () => void;
}

export function TermsModal({ onAccept }: TermsModalProps) {
    const [scrolledToBottom, setScrolledToBottom] = useState(false);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        if (atBottom) setScrolledToBottom(true);
    };

    const handleAccept = () => {
        localStorage.setItem(TERMS_KEY, "1");
        onAccept();
    };

    return (
        <div className="terms-overlay">
            <div className="terms-sheet">
                <div className="terms-header">
                    <div className="terms-icon">⚡</div>
                    <h2 className="terms-title">Terms of Use</h2>
                    <p className="terms-subtitle">Please read and accept before continuing</p>
                </div>

                <div className="terms-body" onScroll={handleScroll}>
                    <section className="terms-section">
                        <h3>1. Non-Custodial Wallet</h3>
                        <p>
                            SolSwap uses Privy MPC (Multi-Party Computation) technology. Your private keys are
                            split between you and Privy — SolSwap never holds, controls, or has access to your
                            private keys or funds. You are solely responsible for your wallet and assets.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h3>2. Not Financial Advice</h3>
                        <p>
                            Nothing in SolSwap constitutes financial, investment, or trading advice. All
                            information is provided for informational purposes only. Cryptocurrency markets are
                            highly volatile. Only trade what you can afford to lose.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h3>3. DeFi Risks</h3>
                        <p>
                            Decentralized finance (DeFi) involves significant risks including but not limited to:
                            smart contract bugs, price manipulation, liquidity risks, and complete loss of funds.
                            Transactions on the blockchain are irreversible. SolSwap is not liable for any losses.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h3>4. Platform Fee</h3>
                        <p>
                            SolSwap charges a 0.5% platform fee on all swaps. This fee is collected automatically
                            via the Jupiter protocol's referral system and is non-refundable. Cross-chain swaps
                            may incur additional bridge fees charged by LI.FI or third-party protocols.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h3>5. No KYC — Pseudonymous Use</h3>
                        <p>
                            SolSwap does not collect identity documents or require KYC. Your identity is linked
                            only to your Telegram account and on-chain wallet address. On-chain transactions are
                            publicly visible on the blockchain but pseudonymous.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h3>6. No Fiat Services</h3>
                        <p>
                            SolSwap does not offer fiat currency deposits, withdrawals, or conversions. All
                            operations are crypto-to-crypto only. SolSwap is not a money services business
                            (MSB) and does not provide payment services.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h3>7. Eligibility</h3>
                        <p>
                            You must be at least 18 years old and legally permitted to use cryptocurrency
                            services in your jurisdiction. By accepting, you confirm you are not located in a
                            jurisdiction where such services are prohibited.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h3>8. Limitation of Liability</h3>
                        <p>
                            SolSwap is provided "as is" without warranties of any kind. To the maximum extent
                            permitted by law, SolSwap and its operators are not liable for any direct, indirect,
                            or consequential losses arising from your use of this service.
                        </p>
                    </section>

                    <div className="terms-scroll-hint">
                        {!scrolledToBottom && <span>↓ Scroll to read all terms</span>}
                    </div>
                </div>

                <div className="terms-footer">
                    <button
                        className={`terms-accept-btn${scrolledToBottom ? " terms-accept-btn--ready" : ""}`}
                        onClick={handleAccept}
                    >
                        {scrolledToBottom ? "I Agree — Continue" : "Read all terms to continue ↓"}
                    </button>
                    <p className="terms-footer-note">
                        You can review these terms anytime in Settings.
                    </p>
                </div>
            </div>
        </div>
    );
}
