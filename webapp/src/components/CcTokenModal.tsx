import { useState, useEffect, useRef } from "react";
import { CC_CHAINS, CC_TOKENS, TOKEN_META, ChainId } from "../lib/chains";

interface CcTokenModalProps {
    open: boolean;
    onClose: () => void;
    /** Called when user picks a token — provides the (possibly switched) chain + symbol */
    onSelect: (chain: ChainId, symbol: string) => void;
    currentChain: ChainId;
    currentSymbol: string;
}

export function CcTokenModal({ open, onClose, onSelect, currentChain, currentSymbol }: CcTokenModalProps) {
    const [activeChain, setActiveChain] = useState<ChainId>(currentChain);
    const [search, setSearch] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    // Sync active chain when modal opens with a new current chain
    useEffect(() => {
        if (open) {
            setActiveChain(currentChain);
            setSearch("");
            // Auto-focus search on open
            setTimeout(() => searchRef.current?.focus(), 100);
        }
    }, [open, currentChain]);

    if (!open) return null;

    const query = search.trim().toLowerCase();
    const tokens = CC_TOKENS[activeChain].filter((t) =>
        !query || t.symbol.toLowerCase().includes(query)
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-panel cc-token-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h3>Select Network &amp; Token</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {/* Step 1 — Network */}
                <div className="cc-modal-section-label">1. Choose Network</div>
                <div className="cc-chain-chips">
                    {CC_CHAINS.map((c) => (
                        <button
                            key={c.id}
                            className={`cc-chain-chip${activeChain === c.id ? " cc-chain-chip--active" : ""}`}
                            onClick={() => { setActiveChain(c.id); setSearch(""); }}
                        >
                            {c.emoji} {c.name}
                        </button>
                    ))}
                </div>

                {/* Step 2 — Token */}
                <div className="cc-modal-section-label">
                    2. Choose Token
                    <span className="cc-modal-section-sub">
                        on {CC_CHAINS.find(c => c.id === activeChain)?.name ?? activeChain}
                    </span>
                </div>
                <div className="cc-token-search-wrap">
                    <span className="cc-token-search-icon">🔍</span>
                    <input
                        ref={searchRef}
                        className="cc-token-search"
                        type="text"
                        placeholder="Search tokens..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="cc-token-search-clear" onClick={() => setSearch("")}>×</button>
                    )}
                </div>

                {/* Token list */}
                <div className="cc-token-list">
                    {tokens.length === 0 ? (
                        <div className="cc-token-empty">No tokens match "{search}"</div>
                    ) : (
                        tokens.map((t) => {
                            const meta = TOKEN_META[t.symbol];
                            const isActive = activeChain === currentChain && t.symbol === currentSymbol;
                            return (
                                <button
                                    key={t.symbol}
                                    className={`cc-token-item${isActive ? " cc-token-item--active" : ""}`}
                                    onClick={() => onSelect(activeChain, t.symbol)}
                                >
                                    <span className="cc-token-item-emoji">{meta?.emoji ?? "🪙"}</span>
                                    <span className="cc-token-item-info">
                                        <span className="cc-token-item-symbol">{t.symbol}</span>
                                        <span className="cc-token-item-name">{meta?.name ?? t.symbol}</span>
                                    </span>
                                    {isActive && <span className="cc-token-item-check">✓</span>}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
