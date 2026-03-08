export type TabId = "wallet" | "swap" | "scan" | "history" | "settings" | "admin";

interface TabBarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    isAdmin?: boolean;
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "wallet",   label: "Wallet",   icon: "🏠" },
    { id: "swap",     label: "Swap",     icon: "🔄" },
    { id: "scan",     label: "Scan",     icon: "🔍" },
    { id: "history",  label: "History",  icon: "📋" },
    { id: "settings", label: "Settings", icon: "⚙️" },
];

export function TabBar({ activeTab, onTabChange, isAdmin }: TabBarProps) {
    const tabs = [...TABS];
    if (isAdmin) {
        tabs.push({ id: "admin", label: "Admin", icon: "🛡️" });
    }

    return (
        <nav className={`tab-bar tab-bar--${tabs.length}`}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    className={`tab-item${activeTab === tab.id ? " tab-item--active" : ""}`}
                    onClick={() => onTabChange(tab.id)}
                    aria-current={activeTab === tab.id ? "page" : undefined}
                >
                    <span className="tab-icon">{tab.icon}</span>
                    <span className="tab-label">{tab.label}</span>
                </button>
            ))}
        </nav>
    );
}
