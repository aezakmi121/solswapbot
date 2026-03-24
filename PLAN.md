# Whale Tracker Enhancement Plan

> **Status:** PLANNING
> **Target version:** v1.5.0

---

## Overview

Enhance the Whale Tracker tab with better UX, explorer integration, activity feeds, and wallet organization features. All changes maintain the non-custodial, read-only nature of the tracker.

---

## Feature 1: Auto-Detect Chain from Address Format

**Scope:** Frontend only (`TrackerPanel.tsx`)
**Effort:** Small

### What changes
- When user types/pastes an address in the "Add New" form, auto-detect chain:
  - `0x` prefix + 42 chars → EVM (default to Ethereum, dropdown stays editable for other EVM chains)
  - Base58 32-44 chars → Solana (lock dropdown to Solana)
  - Empty/partial → keep current dropdown selection
- Add `onChange` handler on the address input that sets `addChain` automatically
- EVM chain dropdown still visible and editable (user may know it's BSC not Ethereum)
- Solana addresses hide/disable the chain dropdown since there's only one option

### Files
- `webapp/src/components/TrackerPanel.tsx` — add auto-detect logic in address input onChange

---

## Feature 2: Explorer Links on Watched Wallets

**Scope:** Frontend only (`TrackerPanel.tsx`, `chains.ts`)
**Effort:** Small

### What changes
- Add `EXPLORER_ADDRESS_URL` map to `webapp/src/lib/chains.ts`:
  ```typescript
  export const EXPLORER_ADDRESS_URL: Record<string, string> = {
    solana:   "https://solscan.io/account/",
    ethereum: "https://etherscan.io/address/",
    bsc:      "https://bscscan.com/address/",
    polygon:  "https://polygonscan.com/address/",
    arbitrum: "https://arbiscan.io/address/",
    base:     "https://basescan.org/address/",
  };
  ```
- Each wallet row in TrackerPanel gets a small `ExternalLink` icon (from lucide-react)
- Tap opens `EXPLORER_ADDRESS_URL[chain] + walletAddress` via `tg.openLink()` or `window.open()`

### Files
- `webapp/src/lib/chains.ts` — add `EXPLORER_ADDRESS_URL` map
- `webapp/src/components/TrackerPanel.tsx` — add explorer link icon to wallet rows

---

## Feature 3: Copy Address Button

**Scope:** Frontend only (`TrackerPanel.tsx`)
**Effort:** Small

### What changes
- Add a `Copy` icon (from lucide-react) next to the truncated address in each wallet row
- On tap: `navigator.clipboard.writeText(fullAddress)` + `toast("Address copied!", "success")`
- Haptic feedback: `tg.HapticFeedback.selectionChanged()`

### Files
- `webapp/src/components/TrackerPanel.tsx` — add copy button + handler

---

## Feature 4: Chain-Aware Alert Explorer Links

**Scope:** Backend (`tracker/alerts.ts`)
**Effort:** Small

### What changes
- Currently `alerts.ts` hardcodes `https://solscan.io/tx/${signature}` for all alerts
- Add an explorer URL map to `alerts.ts` (backend — can't import from webapp):
  ```typescript
  const EXPLORER_TX: Record<string, string> = {
    solana:   "https://solscan.io/tx/",
    ethereum: "https://etherscan.io/tx/",
    bsc:      "https://bscscan.com/tx/",
    polygon:  "https://polygonscan.com/tx/",
    arbitrum: "https://arbiscan.io/tx/",
    base:     "https://basescan.org/tx/",
  };
  ```
- `formatAlert()` and `sendTelegramAlert()` accept a `chain` parameter
- `monitor.ts` passes `chain: "solana"` when calling alert functions
- `webhookMoralis.ts` passes the appropriate EVM chain when firing alerts

### Files
- `src/tracker/alerts.ts` — add chain param, explorer map
- `src/tracker/monitor.ts` — pass chain to alert calls
- `src/api/routes/webhookMoralis.ts` — pass chain to alert calls

---

## Feature 5: Edit Wallet Label (Inline)

**Scope:** Backend + Frontend
**Effort:** Small

### Backend: New endpoint `PATCH /api/tracker/update`

- Body: `{ walletAddress, label?, tag? }` (label can be empty string to clear)
- Auth: Telegram initData, verifies user owns the watched wallet
- Updates `WatchedWallet.label` (and `tag` — see Feature 6) via Prisma
- No schema changes needed for label (already a nullable string)

### Frontend: Inline edit

- Tap the label text on a wallet row → transforms into an input field
- Press Enter or blur → saves via `PATCH /api/tracker/update`
- If wallet has no label, show a subtle "Add label" placeholder that's tappable
- Toast on success: "Label updated"
- Cancel on Escape

### Files
- `src/api/routes/tracker.ts` — new `PATCH /tracker/update` endpoint
- `webapp/src/components/TrackerPanel.tsx` — inline edit UI

---

## Feature 6: Wallet Tags/Groups

**Scope:** Backend + Frontend + DB
**Effort:** Medium

### Database

Add a `tag` field to `WatchedWallet`:
```prisma
model WatchedWallet {
  // ... existing fields ...
  tag  String?   // e.g. "DEX Whales", "VCs", "Dev Wallets"
}
```

No new table — tags are simple strings, not a many-to-many relation. Users type free-form tags; the frontend collects unique tags for filtering.

### Backend

- `POST /api/tracker/watch` — accept optional `tag` in body, store on create
- `PATCH /api/tracker/update` — accept both `label` and `tag`
- `GET /api/tracker/list` — return `tag` field in each wallet object

### Frontend

- Tag chip on each wallet row (small colored pill, e.g. "VCs")
- In "Add New" form: optional tag input (with autocomplete from existing tags)
- Filter row at top of watchlist: "All" + one chip per unique tag
- Tap a tag chip → filters the list to wallets with that tag
- In edit mode (Feature 5): tag is also editable

### Files
- `prisma/schema.prisma` — add `tag String?` to WatchedWallet
- `src/api/routes/tracker.ts` — update watch/update/list endpoints
- `webapp/src/components/TrackerPanel.tsx` — tag UI, filter chips, autocomplete

---

## Feature 7: Recent Activity Feed (Live Fetch)

**Scope:** Backend + Frontend
**Effort:** Medium

### Backend: New endpoint `GET /api/tracker/activity/:walletAddress`

Returns last 5-10 transactions for a watched wallet, fetched live (no DB storage).

**Solana path:**
- `getSignaturesForAddress(pubkey, { limit: 10 })` via Helius RPC
- Parse each signature for transfer amounts (reuse logic patterns from `monitor.ts`)
- Return: `{ transactions: [{ signature, type, amount, symbol, counterparty, timestamp, explorerUrl }] }`

**EVM path:**
- Moralis `getWalletTransactions({ address, chain, limit: 10 })` (requires MORALIS_API_KEY)
- Parse native + ERC-20 transfers from response
- Return same shape as Solana

**Auth:** Telegram initData. Verifies user is watching the wallet.

**Rate consideration:** On-demand fetch only — fires when user taps "Activity" on a specific wallet. Helius RPC handles this fine; Moralis CU cost is ~5 per call.

### Frontend: Activity view in wallet detail

- Add "Activity" button/tab alongside "Holdings" in the portfolio modal
- Simple list: timestamp, direction arrow (in/out), amount + symbol, counterparty (shortened), explorer link
- Loading spinner while fetching
- "No recent activity" empty state

### Files
- `src/api/routes/tracker.ts` — new `GET /tracker/activity/:walletAddress` endpoint
- `webapp/src/components/TrackerPanel.tsx` — activity view in portfolio modal

---

## Implementation Order

| Step | Feature | Effort | Scope | Depends on |
|------|---------|--------|-------|------------|
| 1 | Auto-detect chain | Small | Frontend | — |
| 2 | Explorer links | Small | Frontend | — |
| 3 | Copy address | Small | Frontend | — |
| 4 | Alert explorer links | Small | Backend | — |
| 5 | Edit wallet label | Small | Backend + Frontend | — |
| 6 | Wallet tags/groups | Medium | DB + Backend + Frontend | Feature 5 (shared PATCH endpoint) |
| 7 | Recent activity feed | Medium | Backend + Frontend | — |

Features 1-3 are independent and can be done in a single commit (all frontend TrackerPanel changes).
Feature 4 is an independent backend change.
Features 5-6 share the `PATCH /tracker/update` endpoint — implement together.
Feature 7 is independent but largest — do last.

### Deploy notes
- Features 1-3: Frontend only → Vercel auto-deploys
- Feature 4: VPS redeploy (`npm run build` + `pm2 restart`)
- Features 5-6: VPS redeploy + `npx prisma db push` (adds `tag` column)
- Feature 7: VPS redeploy (no schema change)

---

## What's NOT in scope

- **Historical P&L tracking** — requires snapshot storage + charting library. Defer to v2.0.
- **Push notifications for activity** — alerts already cover this via the monitor. Activity feed is pull-based.
- **Multi-wallet portfolio aggregation** — combining all watched wallets into one view. Nice-to-have, not requested.
