const fs = require("fs");
const path = require("path");

const cssPath = path.join(__dirname, "webapp/src/styles/index.css");
let content = fs.readFileSync(cssPath, "utf-8");

// The good CSS ends at ".tracker-footer-note {" around line 6010
const marker = ".tracker-footer-note {";

const idx = content.indexOf(marker);
if (idx !== -1) {
    // Keep everything up to the end of the .tracker-footer-note block
    // Specifically, let's find the closing brace after .tracker-footer-note
    const closingBraceIdx = content.indexOf("}", idx);
    
    if (closingBraceIdx !== -1) {
        content = content.substring(0, closingBraceIdx + 1) + "\n\n";
        
        // Append the new CSS
        const newCss = `/* ── Tracker Tabs ── */
.tracker-tabs {
  display: flex;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 4px;
  margin-bottom: 16px;
  gap: 4px;
}

.tracker-tab {
  flex: 1;
  background: transparent;
  border: none;
  border-radius: calc(var(--radius-sm) - 4px);
  padding: 10px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tracker-tab:hover {
  color: var(--text-primary);
}

.tracker-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.tracker-tab-content {
  animation: fadeIn 0.3s ease;
}

/* ── Tracker Portfolio Button & Accordion ── */
.tracker-portfolio-btn {
  background: rgba(19, 19, 21, 0.6);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 8px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tracker-portfolio-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.tracker-portfolio-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.tracker-wallet-item-container {
  display: flex;
  flex-direction: column;
  background: rgba(19, 19, 21, 0.4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  overflow: hidden;
}

.tracker-wallet-item-container > .tracker-wallet-item {
  border: none;
  background: transparent;
  margin-bottom: 0;
}

/* ── Tracker Portfolio Drawer ── */
.tracker-portfolio-drawer {
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid var(--border);
  padding: 12px;
  animation: fadeIn 0.3s ease;
}

.tracker-portfolio-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}

.tracker-portfolio-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tracker-portfolio-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.tracker-portfolio-change {
  font-size: 0.85rem;
  font-weight: 500;
}

.tracker-portfolio-change.positive,
.tracker-token-pxchange.positive {
  color: #10b981; /* Emerald green */
}

.tracker-portfolio-change.negative,
.tracker-token-pxchange.negative {
  color: #ef4444; /* Red */
}

.tracker-portfolio-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.tracker-portfolio-table td {
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.tracker-portfolio-table tr:last-child td {
  border-bottom: none;
}

.tracker-token-col {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.tracker-token-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

.tracker-token-icon-fallback {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg-secondary);
}

.tracker-bal-col {
  text-align: right;
  color: var(--text-secondary);
}

.tracker-price-col {
  text-align: right;
}

.tracker-token-price {
  color: var(--text-secondary);
}

.tracker-token-pxchange {
  font-size: 0.75rem;
}

.tracker-val-col {
  text-align: right;
  font-weight: 500;
  color: var(--text-primary);
}
`;
        content += newCss;
        fs.writeFileSync(cssPath, content, "utf-8");
        console.log("Successfully fixed index.css");
    } else {
        console.log("Could not find closing brace after marker.");
    }
} else {
    console.log("Could not find the last good marker");
}
