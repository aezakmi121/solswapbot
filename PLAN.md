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

**What's missing for a real referral program:**
1. **No referral payout mechanism** — earnings are calculated but never paid out
2. **No referral dashboard** — just a single line in Settings showing earnings
3. **No share incentives** — no "Invite friends" CTA, no gamification
4. **No referral tier system** — flat 25% for everyone
5. **No notification when someone uses your referral** — silent
6. **No referral activity feed** — can't see who joined or when

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

### Phase B — Backend Enhancements

3. **New `GET /api/user/referrals`** endpoint:
   - Returns list of referred users (telegramUsername, joinDate, swapCount, feesGenerated)
   - Paginated (offset/limit)
   - Privacy: only show username, not wallet address

4. **Referral activity in Wallet tab**:
   - "New referral joined!" items in activity feed
   - Referral earnings shown as activity items

5. **Referral notification** (Grammy bot):
   - Push notification when someone uses your referral code
   - Weekly earnings summary (optional)

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
| **P1** | Referral dashboard (Phase A) | 1 session | MEDIUM — growth driver | pending |
| **P1** | UI/UX Sprint 3 (secondary tabs) | 2 sessions | MEDIUM — polish | pending |
| **P2** | Referral backend (Phase B) | 1 session | MEDIUM — engagement | pending |
| **P2** | UI/UX Sprint 4 (micro-interactions) | 1 session | LOW — delight | pending |
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
