import type { ReactElement } from "react";

// Only the 4 core navigation tabs live in the bottom bar.
// History → header 🕐 icon | Settings → header ⚙️ icon | Admin → header 🛡 icon
export type TabId = "wallet" | "swap" | "scan" | "tracker" | "history" | "settings" | "admin";

interface TabBarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

// ── SVG Icon components ──

function WalletIcon({ active }: { active: boolean }): ReactElement {
    const w = active ? 2 : 1.75;
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth={w} />
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth={w} />
            <circle cx="16.5" cy="14" r="1.25" fill="currentColor" />
        </svg>
    );
}

function SwapIcon({ active }: { active: boolean }): ReactElement {
    const w = active ? 2 : 1.75;
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 17V5M7 5L3 9M7 5l4 4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 7v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ScanIcon({ active }: { active: boolean }): ReactElement {
    const w = active ? 2 : 1.75;
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            {active && (
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            )}
        </svg>
    );
}

/** Whale Tracker — eye with optional filled pupil when active */
function TrackerIcon({ active }: { active: boolean }): ReactElement {
    const w = active ? 2 : 1.75;
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={w} />
            {active && <circle cx="12" cy="12" r="1.2" fill="currentColor" />}
        </svg>
    );
}

type IconComponent = (props: { active: boolean }) => ReactElement;

const TABS: Array<{ id: TabId; label: string; Icon: IconComponent }> = [
    { id: "wallet",  label: "Wallet",  Icon: WalletIcon },
    { id: "swap",    label: "Swap",    Icon: SwapIcon },
    { id: "scan",    label: "Scan",    Icon: ScanIcon },
    { id: "tracker", label: "Tracker", Icon: TrackerIcon },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
    return (
        <nav className="tab-bar tab-bar--4" role="tablist">
            {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        role="tab"
                        className={`tab-item${isActive ? " tab-item--active" : ""}`}
                        onClick={() => onTabChange(tab.id)}
                        aria-current={isActive ? "page" : undefined}
                        aria-label={tab.label}
                    >
                        <span className="tab-icon">
                            <tab.Icon active={isActive} />
                        </span>
                        <span className="tab-label">{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
