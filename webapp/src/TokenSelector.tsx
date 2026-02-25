import { useState, useEffect, useRef, useCallback } from "react";
import { TokenInfo, fetchPopularTokens, searchTokens } from "./lib/api";

interface TokenSelectorProps {
    open: boolean;
    onClose: () => void;
    onSelect: (token: TokenInfo) => void;
    excludeMint?: string; // hide the other side's token
}

export function TokenSelector({ open, onClose, onSelect, excludeMint }: TokenSelectorProps) {
    const [query, setQuery] = useState("");
    const [popular, setPopular] = useState<TokenInfo[]>([]);
    const [results, setResults] = useState<TokenInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load popular tokens once when first opened
    useEffect(() => {
        if (open && popular.length === 0) {
            fetchPopularTokens()
                .then(setPopular)
                .catch(() => {});
        }
    }, [open, popular.length]);

    // Focus search input when opened
    useEffect(() => {
        if (open) {
            setQuery("");
            setResults([]);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    // Debounced search
    const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
    const handleSearch = useCallback((q: string) => {
        setQuery(q);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (!q.trim()) {
            setResults([]);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await searchTokens(q);
                setResults(data);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);
    }, []);

    if (!open) return null;

    const displayTokens = query.trim()
        ? results.filter((t) => t.mint !== excludeMint)
        : popular.filter((t) => t.mint !== excludeMint);

    return (
        <div className="ts-overlay" onClick={onClose}>
            <div className="ts-panel" onClick={(e) => e.stopPropagation()}>
                <div className="ts-header">
                    <h3>Select token</h3>
                    <button className="ts-close" onClick={onClose}>
                        ×
                    </button>
                </div>

                <input
                    ref={inputRef}
                    className="ts-search"
                    type="text"
                    placeholder="Search name, symbol, or paste address"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                />

                {!query.trim() && (
                    <div className="ts-section-label">Popular tokens</div>
                )}

                <div className="ts-list">
                    {loading && (
                        <div className="ts-empty">Searching...</div>
                    )}

                    {!loading && query.trim() && displayTokens.length === 0 && (
                        <div className="ts-empty">No tokens found</div>
                    )}

                    {!loading &&
                        displayTokens.map((token) => (
                            <button
                                key={token.mint}
                                className="ts-item"
                                onClick={() => {
                                    onSelect(token);
                                    onClose();
                                }}
                            >
                                <div className="ts-icon-wrap">
                                    {token.icon ? (
                                        <img
                                            className="ts-icon"
                                            src={token.icon}
                                            alt=""
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = "none";
                                            }}
                                        />
                                    ) : (
                                        <div className="ts-icon-placeholder">
                                            {token.symbol.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="ts-info">
                                    <span className="ts-symbol">{token.symbol}</span>
                                    <span className="ts-name">{token.name}</span>
                                </div>
                            </button>
                        ))}
                </div>
            </div>
        </div>
    );
}
