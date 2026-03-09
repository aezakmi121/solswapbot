import type { ReactElement } from "react";

export type TabId = "wallet" | "swap" | "scan" | "history" | "settings" | "admin";

interface TabBarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    isAdmin?: boolean;
}

// ── SVG Icon components (stroke-based, active = slightly bolder) ──

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

function HistoryIcon({ active }: { active: boolean }): ReactElement {
    const w = active ? 2 : 1.75;
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={w} />
            <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SettingsIcon({ active }: { active: boolean }): ReactElement {
    const w = active ? 2 : 1.75;
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={w} />
            <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth={w}
            />
        </svg>
    );
}

function AdminIcon({ active }: { active: boolean }): ReactElement {
    const w = active ? 2 : 1.75;
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

type IconComponent = (props: { active: boolean }) => ReactElement;

const TABS: Array<{ id: TabId; label: string; Icon: IconComponent }> = [
    { id: "wallet",   label: "Wallet",   Icon: WalletIcon },
    { id: "swap",     label: "Swap",     Icon: SwapIcon },
    { id: "scan",     label: "Scan",     Icon: ScanIcon },
    { id: "history",  label: "History",  Icon: HistoryIcon },
    { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export function TabBar({ activeTab, onTabChange, isAdmin }: TabBarProps) {
    const tabs = [...TABS];
    if (isAdmin) {
        tabs.push({ id: "admin", label: "Admin", Icon: AdminIcon });
    }

    return (
        <nav className={`tab-bar tab-bar--${tabs.length}`} role="tablist">
            {tabs.map((tab) => {
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
