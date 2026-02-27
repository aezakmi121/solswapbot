import { useEffect, useState } from "react";

interface RiskGaugeProps {
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH";
    tokenName?: string | null;
    tokenSymbol?: string | null;
    tokenIcon?: string | null;
}

// Semicircle arc: radius 85, centre (100,100)
// Arc from (15,100) over the top to (185,100)
// Arc length = π × 85 ≈ 267.04
const R = 85;
const CX = 100;
const CY = 100;
const CIRC = Math.PI * R; // ≈ 267.04

const ARC_D = `M ${CX - R},${CY} A ${R},${R} 0 0,1 ${CX + R},${CY}`;

export function RiskGauge({ score, level, tokenName, tokenSymbol, tokenIcon }: RiskGaugeProps) {
    // Animate from 0 → score on mount (and re-animate on score change)
    const [offset, setOffset] = useState(CIRC);

    useEffect(() => {
        const t = setTimeout(() => {
            setOffset(CIRC * (1 - score / 100));
        }, 80);
        return () => clearTimeout(t);
    }, [score]);

    const label =
        level === "LOW" ? "LOW RISK" :
        level === "MEDIUM" ? "MEDIUM RISK" :
        "HIGH RISK";

    const badgeColor =
        level === "LOW" ? "var(--success)" :
        level === "MEDIUM" ? "var(--warning)" :
        "var(--error)";

    const badgeBg =
        level === "LOW" ? "rgba(74,222,128,0.12)" :
        level === "MEDIUM" ? "rgba(251,191,36,0.12)" :
        "rgba(248,113,113,0.12)";

    return (
        <div className="risk-gauge">
            {/* Token identity row */}
            {(tokenSymbol || tokenName) && (
                <div className="risk-token-header">
                    {tokenIcon && (
                        <img
                            src={tokenIcon}
                            alt={tokenSymbol ?? ""}
                            className="risk-token-icon"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                    )}
                    <div className="risk-token-info">
                        {tokenSymbol && <span className="risk-token-symbol">{tokenSymbol}</span>}
                        {tokenName && tokenName !== tokenSymbol && (
                            <span className="risk-token-name">{tokenName}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Animated arc gauge */}
            <svg
                viewBox="0 0 200 115"
                className="risk-gauge-svg"
                aria-label={`Risk score: ${score} out of 100 — ${label}`}
            >
                <defs>
                    {/* Horizontal gradient following the arc direction */}
                    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stopColor="#4ade80" />
                        <stop offset="50%"  stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#f87171" />
                    </linearGradient>
                </defs>

                {/* Background track */}
                <path
                    d={ARC_D}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="14"
                    strokeLinecap="round"
                />

                {/* Score arc — animates via stroke-dashoffset */}
                <path
                    d={ARC_D}
                    fill="none"
                    stroke="url(#gaugeGrad)"
                    strokeWidth="14"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={offset}
                    style={{
                        transition: "stroke-dashoffset 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    }}
                />

                {/* Score number */}
                <text
                    x={CX}
                    y={CY - 18}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="risk-gauge-number"
                >
                    {score}
                </text>
                <text
                    x={CX}
                    y={CY + 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="risk-gauge-denom"
                >
                    / 100
                </text>
            </svg>

            {/* Risk badge */}
            <div
                className="risk-badge"
                style={{ color: badgeColor, background: badgeBg, borderColor: badgeColor }}
            >
                {label}
            </div>
        </div>
    );
}
