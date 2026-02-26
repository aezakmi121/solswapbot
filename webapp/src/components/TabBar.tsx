export type TabId = "wallet" | "swap" | "scan" | "settings";

interface TabBarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
}

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
    { id: "wallet",   label: "Wallet",   icon: "🏠" },
    { id: "swap",     label: "Swap",     icon: "🔄" },
    { id: "scan",     label: "Scan",     icon: "🔍" },
    { id: "settings", label: "Settings", icon: "⚙️" },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
    return (
        <nav className="tab-bar">
            {TABS.map((tab) => (
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
