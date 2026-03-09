# SolSwap — Production Audit + Implementation Plan

> Updated: 2026-03-09

---

## Part 1: Production Audit — What Works End-to-End

### FULLY WORKING (Production-Ready)

| Feature | Status | Notes |
|---------|--------|-------|
| `/start` command + referral parsing | ✅ Live | Upserts user, handles `ref_CODE` deeplinks |
| Privy MPC wallet (Solana + EVM) | ✅ Live | Auto-created on login, non-custodial |
| Solana swap (Jupiter) | ✅ Live | Quote → sign → confirm → poll status |
| Cross-chain bridge (LI.FI) | ✅ Live | Solana-originated bridges, 6 chains |
| Bridge status poller | ✅ Live | 60s interval, auto-resolves SUBMITTED swaps |
| Token scanner (6 checks) | ✅ Live | Rate-limited 5/day free, subscription-aware |
| Send flow (SOL + SPL) | ✅ Live | Multi-step, ATA creation, Privy signing |
| Receive tracking (Helius) | ✅ Live | Webhook auto-creates, records incoming transfers |
| Portfolio (Solana + 5 EVM chains) | ✅ Live | Jupiter + Moralis, sorted by USD value |
| Transaction history | ✅ Live | Paginated, type/date filtered, detail modal |
| Referral link generation | ✅ Live | `t.me/solswapbot?start=ref_CODE` |
| Referral tracking in DB | ✅ Live | `referredById` set on user creation |
| Referral earnings calculation | ✅ Live | `getReferralEarnings()` sums referred users' swap fees |
| Referral display in Settings | ✅ Live | Shows code, count, earnings USD |
| Admin dashboard | ✅ Live | Stats, users, referrals (gated by ADMIN_TELEGRAM_ID) |
| Fee collection | ✅ Live | Jupiter platformFeeBps=50 → FEE_WALLET ATA |
| Telegram initData auth | ✅ Live | HMAC-SHA256, 1hr expiry, all protected routes |
| GDPR data deletion | ✅ Live | `DELETE /api/user` cascade-deletes |
| Tests (22 backend + 5 frontend) | ✅ Pass | Vitest + Node built-in runner |

### PARTIALLY IMPLEMENTED (Built but Disabled)

| Feature | Status | What's Missing |
|---------|--------|----------------|
| Whale tracker | 🟡 Built, not wired | `startWalletMonitor()` never called, tracker routes not mounted in server.ts |
| Subscription tiers | 🟡 Schema only | No payment flow, no UI, only scanner checks tier |
| EVM-origin bridges | 🟡 Gated | Frontend shows "coming soon" banner |

### REFERRAL SYSTEM — Current State

**What exists:**
- ✅ Referral code auto-generated per user (cuid)
- ✅ `/start ref_CODE` deeplink parsing + `referredById` linking
- ✅ `getReferralEarnings()` — sums 25% of fees from referred users' confirmed swaps
- ✅ `getReferralCount()` — counts referred users
- ✅ Settings panel shows: referral code, copy link, user count, earnings USD
- ✅ Admin dashboard shows top referrers with earnings
- ✅ `GET /api/user/referrals` — paginated referred users list (v0.9.0)
- ✅ `ReferralModal` — full dashboard with stats, how-it-works, user list (v0.9.0)
- ✅ Bot notification — referrer gets Telegram message when someone joins (v0.9.0)
- ✅ "Invite Friends" share CTA with Telegram/Web Share/clipboard fallback (v0.9.0)

**What's missing (Phase C — future):**
1. **No referral payout mechanism** — earnings are calculated but never paid out
2. **No referral tier system** — flat 25% for everyone
3. **No referral leaderboard** — top 10 referrers

---

## Part 2: Referral System Enhancement

### Phase A — Referral Dashboard (Frontend Only, No Backend Changes)

Add a dedicated referral section/modal accessible from Settings:

1. **Referral card in Settings** (replace current minimal display):
   - Large share button with pre-filled message
   - Animated referral count + earnings
   - "Invite Friends" CTA with Telegram share deep-link

2. **Referral detail modal** (slide-up from Settings):
   - Total earnings (large, prominent)
   - Referral count with growth indicator
   - How it works: 3-step explainer (Share → Friend joins → You earn 25%)
   - Share buttons: Copy link, Telegram share, QR code

### Phase B — Backend Enhancements ✅ DONE (v0.9.0)

3. **New `GET /api/user/referrals`** endpoint: ✅
   - Returns list of referred users (telegramUsername, joinDate, swapCount, feesGenerated)
   - Paginated (offset/limit)
   - Privacy: only show username, not wallet address

4. **ReferralModal with referred users list**: ✅ (replaced "activity in Wallet tab" — modal is better UX)
   - Full stats display, how-it-works explainer, paginated user list
   - Accessible from Settings → "View Details" button

5. **Referral notification** (Grammy bot): ✅
   - Push notification when someone uses your referral code
   - Weekly earnings summary (deferred — low priority)

### Phase C — Future (Post-Launch)

6. **Tiered referral rewards** (5→25→50 referrals = higher %)
7. **Referral leaderboard** (top 10 referrers)
8. **Payout mechanism** (claim earnings to wallet via SOL/USDC transfer)

---

## Part 3: UI/UX Overhaul — Native Mobile-First Redesign

### Design Philosophy

**Goal:** Feel like a native fintech app (Phantom, Jupiter Mobile, Revolut) — not a web page in Telegram.

**Principles:**
- Fluid motion: every interaction has feedback (spring animations, not linear)
- Depth: layered surfaces with blur, shadow, elevation
- Touch-first: swipe gestures, long-press menus, drag handles
- Information density: show more data in less space
- Consistency: unified component library

### 3.1 — Design System Foundation

**New CSS architecture** (replace flat index.css):

```
webapp/src/styles/
├── tokens.css          # Design tokens (colors, spacing, typography, shadows)
├── base.css            # Reset, body, scrollbar, safe areas
├── animations.css      # Shared keyframes + transition utilities
├── components.css      # Component styles (or split per-component)
└── index.css           # Import orchestrator
```

**Design tokens:**
- **Colors:** Richer gradient palette (not just flat #7c5cfc)
  - Primary gradient: `linear-gradient(135deg, #7c5cfc, #00d4ff)`
  - Surface hierarchy: 4 elevation levels (bg-0 through bg-3)
  - Success/Error/Warning with glow variants
- **Typography:** Inter with proper scale (12/14/16/20/24/32px)
- **Spacing:** 4px base unit (4/8/12/16/20/24/32/48)
- **Radius:** Consistent (8/12/16/24px)
- **Shadows:** Elevation system (subtle → heavy with colored glow)

### 3.2 — Navigation Overhaul

**Current:** Fixed bottom TabBar with 5 text+icon tabs
**New:** Floating glass-morphism bottom nav with:
- Frosted glass background (`backdrop-filter: blur(20px)`)
- Active tab: filled icon + subtle glow underline
- Inactive: outline icon only (no text labels — icons are enough)
- Swap tab center-prominent (larger, accent-colored)
- Smooth icon transitions (scale + color)
- Pill-shaped active indicator that slides between tabs

### 3.3 — Wallet Tab Redesign

**Current:** Functional but flat
**New — "Fintech Hero" layout:**

```
┌─────────────────────────────────┐
│  [Portfolio Value]              │
│  $1,234.56                     │  ← Large, bold, gradient text
│  ▲ +2.4% today                 │  ← (future: 24h change)
│                                │
│  ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ Send │ │ Recv │ │ Swap │   │  ← Circular action buttons
│  └──────┘ └──────┘ └──────┘   │     with icons + subtle glow
│                                │
│  ── Your Tokens ────────────── │
│  ┌─────────────────────────┐   │
│  │ 🟣 SOL    12.5   $1,200 │   │  ← Card-style token rows
│  │ 🔷 USDC   50.00    $50  │   │     with chain badge
│  │ 🟡 BNB    0.25     $160 │   │
│  └─────────────────────────┘   │
│                                │
│  ── Recent Activity ────────── │
│  │ ↗ Swapped SOL→USDC  2m  │   │
│  │ ↘ Received 0.5 SOL  1h  │   │
└─────────────────────────────────┘
```

Key changes:
- Gradient portfolio value with animated count-up on load
- Circular action buttons (Send/Receive/Swap) with frosted glass cards
- Token rows as elevated cards with subtle borders
- Chain emoji badges with colored backgrounds
- Activity items with relative timestamps
- Pull-to-refresh with custom spinner (not browser default)

### 3.4 — Swap Tab Redesign

**Current:** Functional, ~1200 lines
**New — "Card Stack" design:**

```
┌─────────────────────────────────┐
│  Swap                    ⚙️     │
│                                │
│  ┌─ You Pay ───────────────┐   │
│  │  [SOL icon]  SOL    ▾   │   │  ← Elevated input card
│  │  0.5                    │   │     with inline token picker
│  │  ≈ $48.50              │   │
│  └─────────────────────────┘   │
│            [↕ flip]            │  ← Circular flip button
│  ┌─ You Receive ───────────┐   │     overlapping both cards
│  │  [USDC icon] USDC   ▾   │   │
│  │  48.25                  │   │
│  │  ≈ $48.25              │   │
│  └─────────────────────────┘   │
│                                │
│  Rate: 1 SOL = 96.5 USDC      │
│  Fee: 0.5% · Slippage: 0.5%   │
│                                │
│  ┌─────────────────────────┐   │
│  │     🚀 Swap Now         │   │  ← Full-width gradient button
│  └─────────────────────────┘   │     with loading shimmer
└─────────────────────────────────┘
```

Key changes:
- Two elevated cards for input/output (not flat rows)
- Circular flip button overlapping both cards (like Uniswap)
- Token selector as bottom sheet (not page navigation)
- Slippage inline popup stays (already good)
- Gradient CTA button with shimmer animation on hover
- Success state: confetti/checkmark animation
- Error state: shake animation + red glow

### 3.5 — Token Selector Redesign

**New — Full-screen bottom sheet:**
- Drag handle at top
- Search bar with autofocus
- "Popular" section with horizontal scroll chips
- "Recent" section (last 5 used)
- Token list with icon, name, symbol, balance (if held)
- Smooth slide-up animation (spring physics)

### 3.6 — Scanner Tab Redesign

**Current:** Functional RiskGauge + check list
**New — "Security Report Card":**
- Large animated gauge stays (already good)
- Check results as expandable cards (not flat list)
- Color-coded severity badges
- "Swap This Token" as floating action button
- Recent scans as horizontal scroll cards

### 3.7 — Transaction History Redesign

**Current:** List with filter chips
**New:**
- Segmented control for type filter (not chips)
- Date range as bottom sheet picker (not inline inputs)
- Transaction items as mini-cards with status indicators
- Detail modal with better layout (amounts side by side, not stacked)
- Pull-to-refresh

### 3.8 — Settings Tab Redesign

**Current:** Flat list of settings
**New — "Profile" style:**
- User avatar (Telegram profile pic via initData)
- Wallet addresses as copyable cards with QR button
- Settings grouped into sections with headers
- Referral section promoted (larger, with share CTA)
- Danger zone (logout, delete account) clearly separated

### 3.9 — Micro-Interactions & Animations

| Interaction | Animation |
|-------------|-----------|
| Tab switch | Crossfade content + sliding nav indicator |
| Button press | Scale down 0.97 + haptic |
| Token selector open | Spring slide-up from bottom |
| Swap success | Checkmark with ring animation |
| Swap error | Shake + red flash |
| Pull to refresh | Custom spinner with logo |
| Number changes | Count-up/count-down animation |
| Card appearance | Staggered fade-in from bottom |
| Copy to clipboard | Brief green flash + toast |
| Quote loading | Skeleton shimmer (already exists) |

### 3.10 — Implementation Order

**Sprint 1: Foundation (estimated scope: design tokens + nav + wallet)**
1. Create design tokens (colors, spacing, typography, shadows)
2. New glassmorphism TabBar
3. Wallet tab redesign (hero layout, card-style tokens)
4. Circular action buttons

**Sprint 2: Core Flows (swap + send)**
5. Swap tab card-stack redesign
6. Token selector bottom sheet
7. Send flow polish (step indicators, animations)
8. Success/error animations

**Sprint 3: Secondary Tabs (scan + history + settings)**
9. Scanner "report card" layout
10. Transaction history with segmented controls
11. Settings "profile" layout
12. Referral dashboard modal

**Sprint 4: Polish**
13. Micro-interactions (button press, count-up, stagger)
14. Transition animations between tabs
15. Loading states and skeletons
16. Performance optimization (lazy load heavy tabs)

---

## Part 4: Priority Recommendation

| Priority | Task | Effort | Impact | Status |
|----------|------|--------|--------|--------|
| **P0** | UI/UX Sprint 1 (foundation + wallet) | 2-3 sessions | HIGH — first impression | ✅ DONE (2026-03-09) |
| **P0** | UI/UX Sprint 2 (swap redesign) | 2-3 sessions | HIGH — core revenue flow | ✅ DONE (2026-03-09) |
| **P1** | Referral dashboard (Phase A) | 1 session | MEDIUM — growth driver | ✅ DONE (2026-03-09) |
| **P1** | UI/UX Sprint 3 (secondary tabs) | 2 sessions | MEDIUM — polish | ✅ DONE (2026-03-09) |
| **P2** | Referral backend (Phase B) | 1 session | MEDIUM — engagement | ✅ DONE (2026-03-09) |
| **P2** | UI/UX Sprint 4 (micro-interactions) | 1 session | LOW — delight | pending |
| **P2.5** | EVM-origin bridge signing | 2-3 sessions | HIGH — unlocks full cross-chain revenue | ✅ DONE (2026-03-09) |
| **P3** | Wire up whale tracker | 1 session | LOW — Phase 3 feature | pending |
| **P3** | Subscription payment flow | 2 sessions | LOW — monetization | pending |

---

## P0 Implementation Log (2026-03-09)

### What was done
- **Design tokens**: Added `--gradient-primary`, `--glow-accent`, `--shadow-card`, `--shadow-elevated`, `--bg-glass`, `--border-glass`, `--radius-xl`, `--radius-full`, `--ease-spring`, `--ease-smooth`
- **Body background**: Deep space radial gradient (purple at top, cyan at bottom-right)
- **TabBar**: Full rewrite with SVG stroke icons (Wallet, Swap, Scan, History, Settings, Admin). Active tab: accent color + glow dot indicator at bottom. Glassmorphism background (`backdrop-filter: blur(24px) saturate(200%)`). Press scale animation.
- **Wallet hero**: Portfolio value is now large gradient text (white→purple→indigo). Address in monospace below.
- **Action buttons**: Circular frosted-glass buttons with glow on hover + translateY lift. Label below circle.
- **Token rows**: Glass card section with accent hover tint. Bolder symbols, colored USD values.
- **Swap card**: Elevated glass card (`backdrop-filter: blur(16px)`).
- **Token sections**: Distinct elevated cards with rounded corners and accent focus ring.
- **Flip button**: Accent-ringed circle, spring rotation on hover (180deg + 1.1x scale), glow on hover.
- **CTA button**: Gradient shimmer animation on hover. Better disabled state.
- **Token button**: Accent-tinted background.
- **Skeleton**: Refined sweep animation.
- **Scrollbar**: Hidden (scrollbar-width: none) for native feel.
- **App header**: Simplified wallet badge (just address, no SOL balance).

### Files changed
- `webapp/src/styles/index.css` — ~200 lines appended (P0 overhaul section)
- `webapp/src/components/TabBar.tsx` — full rewrite with SVG icons
- `webapp/src/components/WalletTab.tsx` — action buttons wrapped in `.wallet-action-circle`
- `webapp/src/App.tsx` — simplified header wallet badge

---

## P1 Implementation Log (2026-03-09)

### What was done

**Referral Dashboard (Phase A):**
- Replaced minimal referral section in Settings with a full dashboard card
- **Hero section**: gradient background with large stat numbers (earnings in green gradient, referral count)
- **Referral code**: monospace pill with copy button
- **How it works**: 3-step numbered explainer (Share → Join → Earn 25%)
- **Share CTA**: "Invite Friends" button with Telegram share API → Web Share API → clipboard fallback
- Uses `tg.openTelegramLink()` for native Telegram share dialog

**Secondary Tab Polish:**
- **Settings**: glass card backgrounds, glass border treatment, danger-zone logout button (red tint)
- **Scanner**: glass sections, glass input, hover effects on check rows, glass error/disclaimer, glass recent scans card
- **Transactions**: segmented control type filter (joined pills instead of floating chips), glass date chips, glass detail modal with colored status badges (green confirmed, red failed, amber pending), glass load-more button
- **Token Selector**: glass bottom sheet, glass search input, accent hover on items
- **Receive Modal**: glass overlay + sheet
- **Terms Modal**: glass overlay

### Files changed
- `webapp/src/styles/index.css` — ~350 lines appended (P1 overhaul section)
- `webapp/src/components/SettingsPanel.tsx` — referral dashboard card + Telegram share

---

## P2 Implementation Log (2026-03-09)

### What was done

**Referral Backend (Phase B):**
- **New `getReferralList()` query** in `src/db/queries/referrals.ts`: Fetches paginated referred users with join date, swap count, and fee share earned. Uses parallel Prisma queries (user list + count).
- **New `GET /api/user/referrals` endpoint** in `src/api/routes/user.ts`: Returns paginated referral list. Supports `offset`/`limit` params. Privacy-safe (username only, no wallet addresses).
- **Bot referral notification** in `src/bot/commands/start.ts`: When a new user joins via `/start ref_CODE`, referrer gets: "X just joined SolSwap using your referral link! You now earn 25% of their swap fees." Non-blocking (never fails /start). Uses MarkdownV2 formatting.
- **`setBotInstance()` pattern** in `src/bot/index.ts`: Stores bot reference so startCommand can send messages without circular imports.

**Referral Frontend (Phase B):**
- **New `ReferralModal` component** (`webapp/src/components/ReferralModal.tsx`): Full-screen bottom sheet with:
  - Stats row: earnings (green gradient), referral count, 25% fee share
  - "Invite Friends" (Telegram share API → Web Share → clipboard) + "Copy Link" buttons
  - How-it-works 3-step explainer
  - Paginated referred users list: username, join date, swap count, earned per referral
  - "Load More" button for offset-based pagination
  - Empty state with CTA prompt
- **Updated `SettingsPanel`**: Replaced inline how-it-works with compact card + "Invite Friends" and "View Details" buttons. "View Details" opens ReferralModal.
- **Frontend API**: Added `fetchReferrals()` + `ReferralItem`/`ReferralsResponse` types in `webapp/src/lib/api.ts`.
- **CSS**: Added ~250 lines of `ref-modal-*` styles + `.referral-actions`/`.referral-details-btn`.
- **Version bumped to v0.9.0.**

### Files changed
- `src/db/queries/referrals.ts` — Added `getReferralList()` + `ReferralListItem` interface
- `src/api/routes/user.ts` — Added `GET /api/user/referrals` endpoint
- `src/bot/commands/start.ts` — Added referral notification + `setBotInstance()`
- `src/bot/index.ts` — Wired `setBotInstance()` call
- `webapp/src/components/ReferralModal.tsx` — New file
- `webapp/src/components/SettingsPanel.tsx` — Added ReferralModal trigger + version bump
- `webapp/src/lib/api.ts` — Added `fetchReferrals()` + types
- `webapp/src/styles/index.css` — Added referral modal styles

---

## P2.5 Implementation Log (2026-03-09)

### What was done

**EVM-Origin Bridge Signing (All Directions Live):**
- **PrivyProvider chain config** in `webapp/src/main.tsx`: Added `supportedChains: [mainnet, polygon, bsc, arbitrum, base]` from `@privy-io/chains`. No `viem` dependency needed.
- **Backend EVM tx format** in `src/api/routes/crossChain.ts`: `/api/cross-chain/execute` now returns `evmTransaction: { to, data, value, chainId, gasLimit }` for EVM-origin, `transactionData: base64` for Solana-origin. Solana-only guard removed.
- **Frontend EVM signing** in `webapp/src/components/SwapPanel.tsx`: Added `useSendTransaction` from `@privy-io/react-auth`. `handleBridgeExecute()` routes to Solana or EVM signing based on `ccInputChain`. "Coming soon" guard removed. Button text and disabled conditions updated.
- **Explorer links per chain** in SwapPanel: Bridge done state links to correct explorer (Etherscan, BscScan, etc.) based on input chain.
- **Chain utilities** in `webapp/src/lib/chains.ts`: Added `EVM_CHAIN_IDS`, `EXPLORER_TX_URL` maps.
- **API types** in `webapp/src/lib/api.ts`: Added `EvmTransactionData`, `CrossChainExecuteResult` interfaces.
- **ERC-20 approvals**: LI.FI handles approvals in the quote response — no separate approval tx needed.

### Files changed
- `webapp/src/main.tsx` — Added `@privy-io/chains` import + `supportedChains` in PrivyProvider
- `src/api/routes/crossChain.ts` — Removed Solana-only guard, dual response format (Solana/EVM)
- `webapp/src/components/SwapPanel.tsx` — Added `useSendTransaction`, EVM signing flow, removed "coming soon"
- `webapp/src/lib/api.ts` — Added EVM transaction types + updated `executeCrossChain` return type
- `webapp/src/lib/chains.ts` — Added `EVM_CHAIN_IDS` + `EXPLORER_TX_URL`

---

## Part 5: EVM-Origin Bridge Implementation Plan

### Overview

Currently, cross-chain bridges only work **Solana → EVM** (Solana-originated). The reverse direction (**EVM → Solana** and **EVM → EVM**) is gated with a "coming soon" banner in `SwapPanel.tsx`. This plan covers full EVM-origin bridge signing using Privy's embedded EVM wallet.

### Revenue Impact

LI.FI integrator fees apply to **all bridge directions** — EVM-origin bridges generate the same revenue as Solana-origin. Enabling this doubles the available bridge routes and revenue surface.

### Current State (What Already Exists)

| Component | Status | Details |
|-----------|--------|---------|
| Privy EVM wallet creation | ✅ Done | `main.tsx`: `ethereum: { createOnLogin: "all-users" }` |
| EVM wallet stored in DB | ✅ Done | `User.evmWalletAddress` field, `POST /api/user/evm-wallet` |
| EVM wallet detected in frontend | ✅ Done | `App.tsx` uses `useAllWallets` to find Privy EVM wallet |
| LI.FI backend (chain-agnostic) | ✅ Done | `aggregator/lifi.ts` works for any chain |
| Cross-chain quote API | ✅ Done | `GET /api/cross-chain/quote` works for EVM-origin |
| Cross-chain confirm API | ✅ Done | `POST /api/cross-chain/confirm` records any-direction swaps |
| Cross-chain status API | ✅ Done | `GET /api/cross-chain/status` polls LI.FI for any bridge |
| Frontend EVM-origin guard | ✅ Done | Yellow banner + disabled button when `inputChain !== "solana"` |
| **EVM signing hook** | ✅ Done | `useSendTransaction` from `@privy-io/react-auth` wired in SwapPanel |
| **Backend EVM tx format** | ✅ Done | Returns `evmTransaction` object for EVM-origin, `transactionData` for Solana |
| **PrivyProvider chain config** | ✅ Done | `supportedChains` from `@privy-io/chains` (no viem needed) |
| **ERC-20 token approval** | ✅ Done | LI.FI handles approvals in the quote response |

### Implementation Steps

#### Step 1: PrivyProvider Chain Configuration (frontend)

**File: `webapp/src/main.tsx`**

```typescript
import { mainnet, polygon, bsc, arbitrum, base } from "viem/chains";

// In PrivyProvider config:
supportedChains: [mainnet, polygon, bsc, arbitrum, base],
defaultChain: mainnet,
```

**New dependency:** `npm install viem` in `webapp/` (viem is already a transitive dep of @privy-io/react-auth, but we need direct import for chain objects).

#### Step 2: Backend — Return Full EVM Transaction Object

**File: `src/api/routes/crossChain.ts`**

Currently the `/api/cross-chain/execute` endpoint extracts `.transactionRequest.data` (Solana base64). For EVM, LI.FI returns a different format:

```typescript
// LI.FI Solana response:
{ transactionRequest: { data: "base64..." } }

// LI.FI EVM response:
{ transactionRequest: { to: "0x...", data: "0x...", value: "0x...", chainId: 137, gasLimit: "0x..." } }
```

**Change:** When `inputChain !== "solana"`, return the full `transactionRequest` object instead of just `.data`:

```typescript
// Response shape for EVM:
{
  transactionData: null,           // null for EVM (was base64 for Solana)
  evmTransaction: {                // new field
    to: "0x...",
    data: "0x...",
    value: "0x...",
    chainId: 137,
    gasLimit: "0x..."
  },
  lifiRouteId: "...",
  outputAmount: "...",
  outputAmountUsd: "..."
}
```

Also: remove the Solana-only guard at lines 130-133 of `crossChain.ts`.

#### Step 3: Frontend — EVM Signing Hook

**File: `webapp/src/components/SwapPanel.tsx`**

```typescript
import { useSendTransaction } from "@privy-io/react-auth";

const { sendTransaction } = useSendTransaction();

// In handleBridgeExecute():
if (ccInputChain !== "solana") {
  // EVM bridge
  const res = await executeCrossChain({ ... });
  const txHash = await sendTransaction({
    to: res.evmTransaction.to,
    data: res.evmTransaction.data,
    value: res.evmTransaction.value,
    chainId: res.evmTransaction.chainId,
    gasLimit: res.evmTransaction.gasLimit,
  });
  // Then confirm + poll status (same as Solana path)
}
```

#### Step 4: ERC-20 Token Approval (Critical)

When bridging non-native EVM tokens (e.g., USDC on Ethereum), the user must first approve LI.FI's router contract to spend their tokens.

**Option A (Recommended): Let LI.FI handle approvals**
- LI.FI can include approval in the transaction data if `allowDestinationCall: true` is set
- Check LI.FI docs for `getTokenApproval` endpoint

**Option B: Manual approval transaction**
- Before the bridge tx, send an `approve()` call to the token contract
- **CRITICAL: Use exact amount, NEVER `type(uint256).max` (infinite approval)**
- This requires a second `sendTransaction()` call before the bridge

```typescript
// Approval flow (Option B):
const approvalTx = await sendTransaction({
  to: tokenContractAddress,
  data: encodeApproveCalldata(lifiRouterAddress, exactAmount),
  chainId: chainId,
});
// Wait for approval confirmation
// Then send bridge tx
```

#### Step 5: Remove EVM-Origin Guard

**File: `webapp/src/components/SwapPanel.tsx`**

Remove/modify the yellow "coming soon" banner and disabled button state when `inputChain !== "solana"`. Replace with the actual EVM signing flow.

#### Step 6: Chain Switching (if needed)

Privy may need to switch the user's wallet to the correct EVM chain before signing. Check if `useSendTransaction` handles this automatically or if we need:

```typescript
import { useSetActiveWallet } from "@privy-io/react-auth";
// Switch to correct chain before sending
```

### Security Checklist

| Risk | Mitigation | Priority |
|------|-----------|----------|
| LI.FI router exploit (historical: $11.6M July 2024, $600K earlier) | Both exploits were via **infinite token approvals**. Use exact-amount approvals only. | CRITICAL |
| Malicious `to` address in LI.FI response | Validate `transactionRequest.to` against LI.FI's known router contracts whitelist | HIGH |
| Value manipulation | Display tx value to user before signing (confirmation screen) | HIGH |
| Chain mismatch | Verify `chainId` in response matches expected chain | MEDIUM |
| Gas estimation failures | Use LI.FI's provided `gasLimit`, add 10% buffer | LOW |
| Approval leftover | Use exact amounts; optionally revoke approval after bridge | LOW |

### LI.FI Known Router Contracts (for validation)

These should be maintained as a whitelist and validated before signing:
- Check `https://li.quest/v1/integrations` for current contract addresses per chain
- Hard-fail if `to` address is not in whitelist

### Effort Estimate

| Step | Effort | Dependencies |
|------|--------|-------------|
| Step 1: PrivyProvider config | 15 min | `npm install viem` |
| Step 2: Backend EVM tx format | 30 min | None |
| Step 3: Frontend EVM signing | 1 hr | Steps 1-2 |
| Step 4: ERC-20 approval flow | 1-2 hr | Step 3, LI.FI docs |
| Step 5: Remove guard + UX | 30 min | Steps 3-4 |
| Step 6: Chain switching | 30 min | Privy docs |
| Testing (manual, all chains) | 2-3 hr | All steps |
| **Total** | **~1-2 sessions** | |

### Testing Plan

1. **ETH → SOL** (native → native): simplest, no approval needed
2. **USDC on Ethereum → SOL** (ERC-20 → native): tests approval flow
3. **USDC on Polygon → USDC on Ethereum** (EVM → EVM): tests cross-EVM
4. **Small amounts first** ($1-5): mitigate testing risk
5. **Verify fees collected** in LI.FI partner dashboard

### Files to Modify

| File | Change |
|------|--------|
| `webapp/package.json` | Add `viem` dependency |
| `webapp/src/main.tsx` | Add `supportedChains` + `defaultChain` to PrivyProvider |
| `src/api/routes/crossChain.ts` | Return full EVM tx object, remove Solana-only guard |
| `webapp/src/components/SwapPanel.tsx` | Add `useSendTransaction`, EVM signing flow, remove "coming soon" |
| `webapp/src/lib/api.ts` | Update `CrossChainExecuteResponse` type for `evmTransaction` field |
| `webapp/src/lib/chains.ts` | Possibly add chain ID → viem chain mapping |
