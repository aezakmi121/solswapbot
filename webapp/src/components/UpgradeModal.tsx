import { useState, useEffect } from "react";
import { X, Check, Zap, Eye, Crown } from "lucide-react";
import {
  getSubscription,
  createSubscriptionInvoice,
  SubscriptionInfo,
  PurchasableTier,
  SubscriptionPeriod,
} from "../lib/api";
import { toast } from "../lib/toast";

const tg = (window as any).Telegram?.WebApp;

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional: pre-select a specific tier (e.g. from limit-hit prompt) */
  highlightTier?: PurchasableTier;
}

interface TierDef {
  key: PurchasableTier;
  label: string;
  icon: typeof Zap;
  color: string;
  monthlyStars: number;
  annualStars: number;
  features: string[];
}

const TIERS: TierDef[] = [
  {
    key: "SCANNER_PRO",
    label: "Scanner Pro",
    icon: Zap,
    color: "#22c55e",
    monthlyStars: 250,
    annualStars: 2400,
    features: ["Unlimited token scans", "10/day free limit removed", "All 12 Solana + 8 EVM checks"],
  },
  {
    key: "WHALE_TRACKER",
    label: "Whale Tracker",
    icon: Eye,
    color: "#3b82f6",
    monthlyStars: 250,
    annualStars: 2400,
    features: ["Track up to 20 wallets", "3 free limit removed", "Multi-chain alerts (Solana + EVM)"],
  },
  {
    key: "ALL_ACCESS",
    label: "All Access",
    icon: Crown,
    color: "#a855f7",
    monthlyStars: 400,
    annualStars: 3840,
    features: ["Unlimited scans", "20 tracked wallets", "All premium features"],
  },
];

export function UpgradeModal({ open, onClose, highlightTier }: UpgradeModalProps) {
  const [period, setPeriod] = useState<SubscriptionPeriod>("monthly");
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState<PurchasableTier | null>(null);
  const [polling, setPolling] = useState(false);

  // Fetch current subscription on open
  useEffect(() => {
    if (!open) return;
    getSubscription().then(setSubscription).catch(() => {});
  }, [open]);

  const handleSubscribe = async (tier: PurchasableTier) => {
    setLoading(tier);
    try {
      const { invoiceLink } = await createSubscriptionInvoice(tier, period);

      // Open Telegram's native Stars payment UI
      if (tg?.openInvoice) {
        tg.openInvoice(invoiceLink, (status: string) => {
          if (status === "paid") {
            // Start polling for subscription update
            setPolling(true);
            pollForUpgrade(tier);
          } else if (status === "cancelled") {
            toast("Payment cancelled", "info");
          } else if (status === "failed") {
            toast("Payment failed. Please try again.", "error");
          }
          setLoading(null);
        });
      } else {
        // Fallback: open link directly (outside Telegram)
        window.open(invoiceLink, "_blank");
        setLoading(null);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create invoice", "error");
      setLoading(null);
    }
  };

  const pollForUpgrade = async (expectedTier: PurchasableTier) => {
    // Poll every 2s for up to 30s
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const sub = await getSubscription();
        if (sub.tier === expectedTier && sub.isActive) {
          setSubscription(sub);
          setPolling(false);
          toast("Subscription activated!", "success");
          tg?.HapticFeedback?.notificationOccurred("success");
          return;
        }
      } catch {
        // Continue polling
      }
    }
    setPolling(false);
    toast("Payment received! Subscription may take a moment to activate.", "info");
  };

  if (!open) return null;

  const currentTier = subscription?.tier ?? "FREE";
  const isActive = subscription?.isActive ?? true;

  return (
    <div className="upgrade-overlay" onClick={onClose}>
      <div className="upgrade-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="upgrade-header">
          <h2>Upgrade Your Plan</h2>
          <button className="upgrade-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Current tier badge */}
        {currentTier !== "FREE" && isActive && (
          <div className="upgrade-current">
            Current plan: <strong>{currentTier.replace("_", " ")}</strong>
            {subscription?.expiresAt && (
              <span className="upgrade-expiry">
                {" "}(expires {new Date(subscription.expiresAt).toLocaleDateString()})
              </span>
            )}
          </div>
        )}

        {/* Period toggle */}
        <div className="upgrade-period-toggle">
          <button
            className={`upgrade-period-btn ${period === "monthly" ? "active" : ""}`}
            onClick={() => setPeriod("monthly")}
          >
            Monthly
          </button>
          <button
            className={`upgrade-period-btn ${period === "annual" ? "active" : ""}`}
            onClick={() => setPeriod("annual")}
          >
            Annual
            <span className="upgrade-save-badge">Save 20%</span>
          </button>
        </div>

        {/* Tier cards */}
        <div className="upgrade-tiers">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const stars = period === "monthly" ? tier.monthlyStars : tier.annualStars;
            const isCurrentTier = currentTier === tier.key && isActive;
            const isHighlighted = highlightTier === tier.key;

            return (
              <div
                key={tier.key}
                className={`upgrade-tier-card ${isHighlighted ? "highlighted" : ""} ${isCurrentTier ? "current" : ""}`}
                style={{ "--tier-color": tier.color } as React.CSSProperties}
              >
                <div className="upgrade-tier-header">
                  <Icon size={20} style={{ color: tier.color }} />
                  <span className="upgrade-tier-name">{tier.label}</span>
                  <span className="upgrade-tier-price">
                    {stars} <span className="upgrade-stars-icon">Stars</span>
                    <span className="upgrade-period-label">/{period === "monthly" ? "mo" : "yr"}</span>
                  </span>
                </div>

                <ul className="upgrade-tier-features">
                  {tier.features.map((f, i) => (
                    <li key={i}>
                      <Check size={14} style={{ color: tier.color }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrentTier ? (
                  <button className="upgrade-tier-btn current" disabled>
                    Current Plan
                  </button>
                ) : (
                  <button
                    className="upgrade-tier-btn"
                    style={{ background: tier.color }}
                    onClick={() => handleSubscribe(tier.key)}
                    disabled={loading !== null || polling}
                  >
                    {loading === tier.key
                      ? "Opening payment..."
                      : polling
                      ? "Activating..."
                      : `Subscribe for ${stars} Stars`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Free tier note */}
        <div className="upgrade-free-note">
          Free plan: 10 scans/day + 3 tracked wallets. Swaps are always unlimited.
        </div>
      </div>
    </div>
  );
}
