interface RiskGaugeProps {
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH";
}

export function RiskGauge({ score, level }: RiskGaugeProps) {
    const color =
        level === "LOW" ? "var(--success)" :
        level === "MEDIUM" ? "var(--warning)" :
        "var(--error)";

    const bgColor =
        level === "LOW" ? "rgba(74,222,128,0.12)" :
        level === "MEDIUM" ? "rgba(251,191,36,0.12)" :
        "rgba(248,113,113,0.12)";

    const label =
        level === "LOW" ? "LOW RISK" :
        level === "MEDIUM" ? "MEDIUM RISK" :
        "HIGH RISK";

    return (
        <div className="risk-gauge">
            <div className="risk-gauge-score" style={{ color }}>
                <span className="risk-score-number">{score}</span>
                <span className="risk-score-denom">/100</span>
            </div>
            <div className="risk-badge" style={{ color, background: bgColor, borderColor: color }}>
                {label}
            </div>
        </div>
    );
}
