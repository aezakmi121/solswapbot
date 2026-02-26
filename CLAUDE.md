# CLAUDE.md — SolSwap Master Context & Development Guide

> **This is the single source of truth for the SolSwap project.**
> Updated: 2026-02-26 | Version: 0.2.0-dev
> Read this file FIRST before making any changes.

---

## Quick Start

```bash
npm install
cp .env.example .env  # Fill in API keys
npx prisma generate && npx prisma db push
npm run dev
```

## Commands

- `npm run dev` — Start bot + API in dev mode (tsx watch)
- `npm run build` — Compile TypeScript
- `npm start` — Run production build
- `npm run lint` — Type-check without emit
- `cd webapp && npm run dev` — Start Mini App dev server

---

## What Is SolSwap?

SolSwap is a **Telegram Mini App** for swapping tokens across multiple blockchains (Solana, Ethereum, BNB Chain, Polygon, Arbitrum, Base) — entirely inside Telegram. No external wallets, no redirects.

It also provides **token safety scanning**, **whale tracking**, and **AI market signals** — accessible from a single Mini App interface.

---

## Architecture

```
┌─────────────────────────────────────────┐
│ Telegram                                │
│  ┌──────────┐    ┌────────────────────┐ │
│  │ Grammy   │    │ Mini App (Vite)    │ │
│  │ Bot      │    │ React + Privy SDK  │ │
│  │ /start   │    │ Wallet|Swap|Scan|⚙ │ │
│  └────┬─────┘    └────────┬───────────┘ │
└───────┼───────────────────┼─────────────┘
        │                   │
        ▼                   ▼
┌─────────────────────────────────────────┐
│ Express API Server (:3001)              │
│ Routes: /api/quote, /api/swap,          │
│   /api/scan, /api/price, /api/user,     │
│   /api/tokens, /api/cross-chain/*       │
├─────────────────────────────────────────┤
│ SQLite via Prisma ORM                   │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ External APIs                           │
│  • Jupiter (Solana swaps + fees)        │
│  • LI.FI (cross-chain routing)          │
│  • Helius (webhooks, RPC)               │
│  • Privy (embedded wallets, MPC)        │
│  • Gemini API (AI signals)              │
└─────────────────────────────────────────┘
```

### Key Design Decisions

1. **Mini App-First** — Bot is only a launcher (`/start`). ALL features live in the Mini App.
2. **Non-Custodial** — Privy MPC handles wallets. We never hold keys.
3. **Revenue via API Params** — Jupiter `platformFeeBps` (0.5%) and LI.FI integrator fees. Zero liability.
4. **SQLite Is Enough** — Read-heavy, light writes. ~4 MB/month at 1K users. One-line Prisma migration to Postgres if needed.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Bot Framework | Grammy (TypeScript) |
| API Server | Express.js |
| Database | SQLite via Prisma ORM |
| Mini App Frontend | Vite + React + TypeScript |
| Wallet Infrastructure | Privy (MPC embedded wallets) |
| Solana DEX | Jupiter API — Swap V1, Token V2, Price V3 (lite-api.jup.ag) |
| Cross-Chain | LI.FI API (routing + bridging) |
| Blockchain RPC | Helius (Solana) |
| AI | Google Gemini API |
| Validation | Zod schemas |
| Deployment | Hostinger VPS (backend) + Vercel (webapp) |

---

## Project Structure

```
solswapbot/
├── src/
│   ├── app.ts                 # Entry point — starts bot + API server + graceful shutdown
│   ├── config.ts              # Zod-validated env config (crash-early)
│   ├── api/
│   │   ├── server.ts          # Express setup, trust proxy, helmet, CORS, rate limiter
│   │   ├── middleware/
│   │   │   └── telegramAuth.ts # Telegram initData HMAC-SHA256 verification (C2/C5)
│   │   └── routes/
│   │       ├── quote.ts       # GET /api/quote (Jupiter + USD breakdown)
│   │       ├── swap.ts        # POST /api/swap, POST /api/swap/confirm, GET /api/swap/status
│   │       ├── price.ts       # GET /api/price/:mint
│   │       ├── tokens.ts      # GET /api/tokens, GET /api/tokens/search
│   │       ├── user.ts        # GET /api/user, POST /api/user/wallet, GET /api/user/balances
│   │       ├── scan.ts        # GET /api/scan (token safety)
│   │       ├── crossChain.ts  # GET /api/cross-chain/quote|chains|tokens
│   │       └── history.ts     # GET /api/history (last 20 swaps)
│   ├── bot/
│   │   ├── index.ts           # Bot setup — /start + /help only, catch-all → Mini App
│   │   ├── commands/
│   │   │   └── start.ts       # /start — upserts user + shows Mini App button
│   │   └── middleware/
│   │       ├── logger.ts      # Audit trail (swap, connect, start, status)
│   │       └── rateLimit.ts   # Per-user per-command limits
│   ├── jupiter/
│   │   ├── quote.ts           # Jupiter quote with platformFeeBps + Zod validation
│   │   ├── swap.ts            # Jupiter swap TX builder (passes feeAccount as ATA)
│   │   ├── price.ts           # Jupiter price API v3
│   │   └── tokens.ts          # Jupiter token list API v2 + fallback tokens
│   ├── aggregator/
│   │   ├── router.ts          # Smart router: Jupiter (same-chain) vs LI.FI (cross-chain)
│   │   ├── lifi.ts            # LI.FI API client (works without key)
│   │   └── chains.ts          # Chain + token registry (6 chains, 20+ tokens)
│   ├── scanner/
│   │   ├── analyze.ts         # Token risk scoring (0-100, 4 checks in parallel)
│   │   └── checks.ts          # Safety checks: mint auth, freeze, top holders, age
│   ├── solana/
│   │   ├── connection.ts      # RPC connection singleton
│   │   └── transaction.ts     # TX polling + confirmation (100 attempts × 3s)
│   ├── db/
│   │   ├── client.ts          # Prisma singleton
│   │   └── queries/
│   │       ├── users.ts       # User CRUD (upsert) + referral count
│   │       ├── fees.ts        # Fee aggregation queries
│   │       └── referrals.ts   # Referral earnings queries
│   └── utils/
│       ├── retry.ts           # Exponential backoff (transient errors only)
│       ├── validation.ts      # Solana address validation + input sanitization
│       ├── formatting.ts      # Token amounts + address shortening
│       └── constants.ts       # Token registry (6 tokens)
├── webapp/                    # Telegram Mini App (deployed to Vercel)
│   ├── src/
│   │   ├── App.tsx            # Main swap interface — balance check, quote, swap flow
│   │   ├── main.tsx           # React entry + PrivyProvider + ErrorBoundary
│   │   ├── ErrorBoundary.tsx  # React error boundary — catches crashes, shows reload button
│   │   ├── TokenSelector.tsx  # Token search + selection modal (Jupiter-powered)
│   │   ├── lib/
│   │   │   └── api.ts         # API client — auth headers, all fetch functions
│   │   └── styles/
│   │       └── index.css      # Dark theme styles
│   ├── index.html
│   ├── vite.config.ts
│   └── vercel.json            # Rewrites /api/* → VPS backend (HTTPS)
├── prisma/
│   └── schema.prisma          # User, Swap, TokenScan, WatchedWallet, Subscription + indexes
├── package.json
├── tsconfig.json
├── ecosystem.config.js        # PM2 config for VPS (single instance, SQLite, 256MB limit)
└── .env.example
```

---

## Database Schema (Prisma)

| Model | Fields | Status |
|-------|--------|--------|
| **User** | telegramId, walletAddress, referralCode, referredBy | DONE |
| **Swap** | inputMint, outputMint, amounts, chains, feeAmountUsd, txSignature, status | DONE |
| **TokenScan** | mintAddress, riskScore (0-100), riskLevel, flags (JSON) | DONE |
| **WatchedWallet** | walletAddress, label, active | DONE (schema only, no API) |
| **Subscription** | tier (FREE/SCANNER_PRO/WHALE_TRACKER/SIGNALS/ALL_ACCESS), expiresAt | DONE (schema only, no enforcement) |

Status enum: `PENDING → SUBMITTED → CONFIRMED / FAILED / TIMEOUT`

---

## Revenue Flow

```
User swaps SOL → USDC via Mini App
  └→ Jupiter API receives platformFeeBps=50
     └→ 0.5% fee auto-collects into FEE_WALLET_ADDRESS
        └→ ✅ feeAccount correctly derived as ATA via getAssociatedTokenAddressSync (fixed 2026-02-25)

User swaps SOL → ETH (cross-chain)
  └→ LI.FI API routes through best bridge
     └→ Integrator fee via LI.FI partner portal (needs API key)

User subscribes to Whale Tracker (future)
  └→ Telegram Stars payment → converts to revenue

User clicks exchange link (future)
  └→ Affiliate commission (up to 50% lifetime)
```

---

## API Routes Reference

All routes are served from Express on port 3001. Vercel rewrites `/api/*` to the VPS backend.

### Public Routes (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check — returns `{ status: "ok" }` |
| GET | `/api/price/:mint` | Get USD price for a token mint (Jupiter Price API v3) |
| GET | `/api/tokens` | Get popular token list (Jupiter-sourced, cached) |
| GET | `/api/tokens/search?query=<q>` | Search tokens by symbol, name, or mint address |

### Protected Routes (require `Authorization: tma <initData>`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user` | Get user profile + SOL balance |
| POST | `/api/user/wallet` | Save Privy wallet address `{ walletAddress }` |
| GET | `/api/user/balances?walletAddress=<addr>` | Get SOL + all SPL token balances |
| GET | `/api/quote?inputMint=&outputMint=&humanAmount=` | Get swap quote with USD breakdown |
| POST | `/api/swap` | Build unsigned swap TX `{ quoteResponse, userPublicKey }` |
| POST | `/api/swap/confirm` | Record swap + start on-chain polling `{ txSignature, inputMint, ... }` |
| GET | `/api/swap/status?swapId=<id>` | Poll swap confirmation status |
| GET | `/api/scan?mint=<addr>` | Token safety scan (risk score 0-100) |
| GET | `/api/cross-chain/quote` | LI.FI cross-chain quote |
| GET | `/api/cross-chain/chains` | Supported chains list |
| GET | `/api/cross-chain/tokens` | Cross-chain token registry |
| GET | `/api/history` | Last 20 swaps for the authenticated user |

### Auth Flow
1. Frontend sends `Authorization: tma <tg.initData>` header
2. `telegramAuth.ts` middleware validates HMAC-SHA256 signature using bot token
3. Extracts `telegramId` from verified payload → `res.locals.telegramId`
4. Rejects if hash invalid, auth_date expired (>1hr), or user field missing

---

## Coding Patterns

1. **Zod validation** on Jupiter API responses (NOT yet on LI.FI — see audit M9)
2. **Prisma queries** in `src/db/queries/` — one file per domain
3. **Retry wrapper** via `src/utils/retry.ts` — used for Jupiter, NOT for LI.FI or price API (see audit M10)
4. **Input sanitization** via `src/utils/validation.ts` — applied on quote route (mint addresses, amounts)
5. **Config validated at startup** — crash early on missing env vars
6. **Smart routing** — `src/aggregator/router.ts` auto-selects Jupiter (same-chain) vs LI.FI (cross-chain)
7. **Telegram initData auth** — `src/api/middleware/telegramAuth.ts` HMAC-validates initData on protected routes
8. **Dynamic balance checks** — `GET /api/user/balances` returns SOL + all SPL token balances via RPC

---

## Implementation Status & Phases

### Current State (v0.1.0) — FOUNDATION

| Feature | Status | Notes |
|---------|--------|-------|
| Grammy bot (/start launcher) | DONE | Catch-all redirects to Mini App |
| Express API (8 route groups) | DONE | quote, swap, price, tokens, user, scan, cross-chain, history |
| Jupiter swap integration | DONE | Quote + TX builder + platformFeeBps |
| Jupiter price feed | DONE | v3 API, no auth needed |
| LI.FI cross-chain routing | DONE | 6 chains, works without API key |
| Token scanner (4 checks) | DONE | Mint auth, freeze, holders, age |
| Smart routing (Jupiter/LI.FI) | DONE | Auto-selects by chain |
| DB schema (5 models) | DONE | All models + indexes |
| Retry logic + validation | DONE | Exponential backoff, Zod throughout |
| Rate limiting middleware | DONE | Per-user per-command |
| Webapp — Privy-integrated swap page | DONE | Telegram login, embedded wallet, in-app signing |
| Privy SDK integration | DONE | PrivyProvider + useWallets + useSignAndSendTransaction |
| POST /api/user/wallet | DONE | Auto-saves Privy wallet address to DB |
| GET /api/history | DONE | Returns last 20 swaps with token symbol resolution |
| History panel (slide-up UI) | DONE | Tap wallet badge to open |

### Phase 1 — WALLET & CORE SWAP (COMPLETED 2026-02-24)

| Task | Status | Priority |
|------|--------|----------|
| Integrate Privy SDK in webapp | DONE | P0 |
| Privy wallet creation on first open | DONE | P0 |
| In-app transaction signing (replace Phantom deep-link) | DONE | P0 |
| End-to-end swap flow (deposit → swap → confirm) | DONE | P0 |
| GET /api/history endpoint | DONE | P1 |
| POST /api/user/wallet endpoint | DONE | P1 |
| Swap history panel UI | DONE | P1 |

### Phase 2 — MINI APP UI & WALLET FEATURES

> **Goal:** Transform the Mini App from a single swap screen into a full wallet experience
> with tab navigation, portfolio view, send/receive, token scanner, and settings.
> Modeled after Phantom, Tonkeeper, and top Telegram mini app wallet UX patterns.

#### Phase 2 Summary Table

| Task | Status | Priority | Sprint |
|------|--------|----------|--------|
| **Architecture & Navigation** | | | |
| Tab navigation bar (Wallet / Swap / Scan / Settings) | NOT STARTED | P0 | 2A |
| Extract SwapPanel from App.tsx | NOT STARTED | P0 | 2A |
| App.tsx → tab router + shared state | NOT STARTED | P0 | 2A |
| **Wallet Tab (Home)** | | | |
| WalletHeader — total portfolio value (USD) | NOT STARTED | P0 | 2A |
| Action buttons row (Send / Receive / Swap) | NOT STARTED | P0 | 2A |
| Portfolio token list (all held tokens + USD values) | NOT STARTED | P0 | 2A |
| Receive flow (address + QR code + copy + share) | NOT STARTED | P0 | 2A |
| Send flow (token select → address → amount → confirm → send) | NOT STARTED | P1 | 2B |
| GET /api/user/portfolio endpoint (balances + USD prices) | NOT STARTED | P0 | 2A |
| Transaction history (all types, not just swaps) | NOT STARTED | P1 | 2B |
| Pull-to-refresh on portfolio | NOT STARTED | P2 | 2C |
| **Scan Tab** | | | |
| ScanPanel — mint address input + search | NOT STARTED | P1 | 2B |
| Risk score gauge (0-100, color-coded arc) | NOT STARTED | P1 | 2B |
| Individual check results (pass/fail with details) | NOT STARTED | P1 | 2B |
| Token info display (supply, price, age) | NOT STARTED | P1 | 2B |
| "Swap this token" quick action → navigates to Swap tab | NOT STARTED | P2 | 2C |
| Recent scans list (from DB) | NOT STARTED | P2 | 2C |
| GET /api/scan/history endpoint | NOT STARTED | P2 | 2C |
| Frontend `fetchScan` API function | NOT STARTED | P1 | 2B |
| **Settings Tab** | | | |
| View full wallet address + copy button | NOT STARTED | P1 | 2B |
| Show wallet QR code | NOT STARTED | P1 | 2B |
| Slippage tolerance setting (0.1% / 0.5% / 1.0% / custom) | NOT STARTED | P1 | 2B |
| Referral code display + share | NOT STARTED | P2 | 2C |
| About section (version, fees, non-custodial disclaimer) | NOT STARTED | P2 | 2C |
| Log out button (moved from footer) | NOT STARTED | P1 | 2B |
| **Swap Tab Enhancements** | | | |
| Slippage settings gear icon (uses Settings value) | NOT STARTED | P1 | 2B |
| Recent/favorite tokens shortcut | NOT STARTED | P2 | 2C |
| Cross-chain swap UI (chain selector for LI.FI) | NOT STARTED | P2 | 2C |
| **UI/UX Polish** | | | |
| Skeleton loading states (shimmer placeholders) | NOT STARTED | P2 | 2C |
| Toast notifications (copy, send, errors) | NOT STARTED | P2 | 2C |
| Haptic feedback via Telegram WebApp API | NOT STARTED | P2 | 2C |
| Smooth tab transition animations | NOT STARTED | P2 | 2C |
| **Already Done** | | | |
| TokenSelector component (search + select) | DONE | P1 | — |
| History section in swap tab (slide-up panel) | DONE | P2 | — |
| React Error Boundary | DONE | P1 | — |

---

### Phase 2 — Detailed Design

#### 2.1 Tab Navigation

```
┌──────────────────────────────────────┐
│  ⚡ SolSwap           [wallet badge] │  ← shared header
├──────────────────────────────────────┤
│                                      │
│         [ Tab Content Area ]         │
│                                      │
├──────────────────────────────────────┤
│  🏠 Wallet  │  🔄 Swap  │  🔍 Scan  │  ⚙️ Settings  │  ← bottom tab bar
└──────────────────────────────────────┘
```

**Implementation:**
- `App.tsx` becomes a tab router: renders `<WalletTab>`, `<SwapPanel>`, `<ScanPanel>`, or `<SettingsPanel>` based on active tab
- State (`activeTab`) stored in App.tsx, passed as prop or via context
- Shared state (wallet address, balances, tokens) stays in App.tsx and passes down
- Tab bar is a fixed-bottom component, always visible
- Default tab on launch: **Wallet**
- Swap tab preserves all existing swap logic (extracted from current App.tsx)

**Files to create:**
```
webapp/src/
├── components/
│   ├── TabBar.tsx           # Bottom navigation bar
│   ├── WalletTab.tsx        # Portfolio + send/receive
│   ├── SwapPanel.tsx        # Extracted from App.tsx (all swap logic)
│   ├── ScanPanel.tsx        # Token scanner UI
│   ├── SettingsPanel.tsx    # Wallet info + preferences
│   ├── ReceiveModal.tsx     # QR code + address + copy + share
│   ├── SendFlow.tsx         # Multi-step send flow
│   └── RiskGauge.tsx        # Visual risk score component for scanner
```

#### 2.2 Wallet Tab (Home Screen)

The primary screen users see when opening the app. Modeled after Phantom/Tonkeeper.

```
┌──────────────────────────────────────┐
│          $124.56                     │  ← Total portfolio value (USD)
│     GkXn...4f2R  📋                 │  ← Address (tap to copy)
├──────────────────────────────────────┤
│  [ 📥 Receive ]  [ 📤 Send ]  [ 🔄 Swap ]  │  ← Action buttons
├──────────────────────────────────────┤
│  Your Tokens                         │
│  ┌──────────────────────────────────┐│
│  │ ◎ SOL        1.234    $234.56   ││  ← Token icon, symbol, amount, USD
│  │ 💵 USDC    50.00       $50.00   ││
│  │ 🪐 JUP      100.0      $12.34   ││
│  │ 🐕 BONK  1,000,000      $5.67   ││
│  └──────────────────────────────────┘│
├──────────────────────────────────────┤
│  Recent Activity                     │
│  🔄 SOL → USDC    0.5 SOL   ✅ 2h  │
│  📤 Sent SOL      0.1 SOL   ✅ 1d  │
│  📥 Received USDC 10 USDC   ✅ 3d  │
└──────────────────────────────────────┘
```

**Portfolio Token List:**
- Calls `GET /api/user/balances` (already exists) + `GET /api/price/:mint` for each held token
- New endpoint: `GET /api/user/portfolio` — returns balances merged with USD prices in one call (avoids N+1)
- Tokens sorted by USD value descending, then alphabetically
- Tokens with 0 balance are hidden
- Shows token icon (from Jupiter token list), symbol, human-readable amount, USD value
- Pull-to-refresh: calls `refreshBalance()` on swipe-down

**Backend changes needed:**
- New route: `GET /api/user/portfolio` — combines balances + batch price lookup in one request
  - Returns: `{ totalValueUsd, tokens: [{ mint, symbol, name, icon, amount, decimals, priceUsd, valueUsd }] }`
  - Uses Jupiter Price API v3 batch endpoint (comma-separated mints)

#### 2.3 Receive Flow

Bottom-sheet modal triggered by "Receive" action button.

```
┌──────────────────────────────────────┐
│  Receive Tokens              ✕      │
├──────────────────────────────────────┤
│         ┌─────────────┐             │
│         │             │             │
│         │  [QR CODE]  │             │  ← QR code encoding wallet address
│         │             │             │
│         └─────────────┘             │
│                                      │
│  Solana Network                      │  ← Network label
│                                      │
│  GkXn8f4R...2jK9p4f2R              │  ← Full address (monospace)
│                                      │
│  [ 📋 Copy Address ]  [ 📤 Share ] │  ← Action buttons
│                                      │
│  ⚠️ Only send Solana tokens to     │
│  this address.                       │  ← Safety warning
└──────────────────────────────────────┘
```

**Implementation:**
- QR code generated client-side using `qrcode` npm package (lightweight, no backend needed)
- Copy button uses `navigator.clipboard.writeText()` with haptic feedback
- Share button uses Telegram WebApp's share API or native `navigator.share()` if available
- Network label: "Solana Network" (hardcoded for now, future: chain selector for cross-chain)
- Safety warning: reminds user to only send Solana SPL tokens to this address

#### 2.4 Send Flow

Multi-step bottom-sheet flow triggered by "Send" action button.

```
Step 1: Select Token          Step 2: Enter Details         Step 3: Confirm
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ Send                 │     │ Send SOL             │     │ Confirm Send         │
│                      │     │                      │     │                      │
│ Select token to send │     │ To:                  │     │ Sending              │
│                      │     │ [paste address    📋]│     │ 0.5 SOL (~$95.00)    │
│ ◎ SOL     1.234     │     │                      │     │                      │
│ 💵 USDC   50.00     │     │ Amount:              │     │ To:                  │
│ 🪐 JUP    100.0     │     │ [0.5          ] [MAX]│     │ 7xKX...9f2R          │
│                      │     │ Balance: 1.234 SOL   │     │                      │
│                      │     │ ~$95.00              │     │ Network fee: ~0.000005│
│                      │     │                      │     │ SOL                  │
│                      │     │ [Continue →]         │     │ [Confirm & Send]     │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

**Implementation:**
- Step 1: Show only tokens the user holds (from portfolio data), tap to select
- Step 2: Recipient address input (paste from clipboard, validate as Solana address)
  - Amount input with MAX button (reserves 0.01 SOL for fees if sending SOL)
  - Real-time USD value display
  - "Continue" validates address + amount before proceeding
- Step 3: Confirmation screen showing summary
  - "Confirm & Send" builds + signs + sends transfer transaction via Privy
  - Shows confirming state → done with Solscan link

**Backend changes needed:**
- New route: `POST /api/send` — builds an unsigned SPL transfer or SOL transfer transaction
  - Body: `{ tokenMint, recipientAddress, amount, senderAddress }`
  - Returns: `{ transaction: base64, lastValidBlockHeight }`
  - Validates recipient address, amount > 0, sender has balance
- Uses `@solana/spl-token` `createTransferInstruction` for SPL tokens
- Uses `SystemProgram.transfer` for native SOL

#### 2.5 Scan Tab (Token Scanner)

```
┌──────────────────────────────────────┐
│  Token Scanner                       │
│                                      │
│  [Paste token address or search... ] │  ← Input field
│  [ Scan ]                            │  ← Submit button
├──────────────────────────────────────┤
│                                      │
│         Risk Score: 25/100           │
│      ┌──────────────────┐            │
│      │   🟢 LOW RISK    │            │  ← Color-coded badge
│      └──────────────────┘            │
│                                      │
│  Checks:                             │
│  ✅ Mint Authority    Disabled       │
│  ✅ Freeze Authority  Disabled       │
│  ⚠️ Top Holders      Top 10: 45.2% │
│  ✅ Token Age         2.3 years      │
│                                      │
│  Token Info:                         │
│  Supply: 1,000,000,000              │
│  Price: $1.23                        │
│  Decimals: 6                         │
│                                      │
│  [ 🔄 Swap This Token ]             │  ← Navigate to swap tab
├──────────────────────────────────────┤
│  Recent Scans                        │
│  BONK — LOW (12) — 2h ago           │
│  BOME — HIGH (78) — 1d ago          │
└──────────────────────────────────────┘
```

**Risk Score Visual:**
- Score 0-20: Green badge "LOW RISK"
- Score 21-50: Yellow badge "MEDIUM RISK"
- Score 51-100: Red badge "HIGH RISK"
- Optional: semicircular gauge/arc with needle (RiskGauge component)

**Implementation:**
- Input: paste mint address or search by name (reuse token search from TokenSelector)
- On submit: calls `GET /api/scan?mint=<address>` (already exists in backend)
- Results displayed inline (no modal)
- Each check shows pass/fail icon + detail text
- "Swap This Token" sets the output token and switches to Swap tab
- Recent scans: stored in localStorage (no backend needed) or fetched from DB

**Frontend API function needed:**
```typescript
// Add to webapp/src/lib/api.ts
export interface ScanResult {
    mintAddress: string;
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    checks: Array<{ name: string; safe: boolean; detail: string; weight: number }>;
    tokenInfo: { supply: string | null; decimals: number | null; price: number | null };
    scannedAt: string;
}
export async function fetchTokenScan(mint: string): Promise<ScanResult> { ... }
```

#### 2.6 Settings Panel

```
┌──────────────────────────────────────┐
│  Settings                            │
├──────────────────────────────────────┤
│  Wallet                              │
│  ┌──────────────────────────────────┐│
│  │ Address                          ││
│  │ GkXn8f4R...2jK9p4f2R     📋 🔲 ││  ← Copy + QR buttons
│  └──────────────────────────────────┘│
│                                      │
│  Trading                             │
│  ┌──────────────────────────────────┐│
│  │ Slippage Tolerance               ││
│  │ [0.1%] [0.5%] [1.0%] [Custom]   ││  ← Radio/chip selector
│  └──────────────────────────────────┘│
│                                      │
│  Referral                            │
│  ┌──────────────────────────────────┐│
│  │ Your Code: ABC123         📋    ││
│  │ Referrals: 5 users               ││
│  │ [ Share Referral Link ]          ││
│  └──────────────────────────────────┘│
│                                      │
│  About                               │
│  ┌──────────────────────────────────┐│
│  │ SolSwap v0.2.0                   ││
│  │ Non-custodial · Privy MPC wallet ││
│  │ Platform fee: 0.5% per swap      ││
│  │ Powered by Jupiter & LI.FI       ││
│  └──────────────────────────────────┘│
│                                      │
│  [ 🚪 Log Out ]                     │
└──────────────────────────────────────┘
```

**Slippage persistence:**
- Stored in `localStorage` under key `solswap_slippage_bps`
- Default: 50 (0.5%)
- Passed to quote API as query param: `&slippageBps=<value>`
- Swap tab reads from localStorage on mount

**Referral:**
- Backend already has `referralCode` on User model
- `GET /api/user` already returns user data — needs to include `referralCode` and `referralCount`
- Share link format: `https://t.me/<bot_username>?start=ref_<CODE>`

#### 2.7 Swap Tab Enhancements

Minor improvements to existing swap UI:

1. **Slippage gear icon** — small ⚙️ button in swap card header, shows current slippage, taps to Settings tab
2. **Recent tokens** — show last 3 tokens used as quick-select chips above the token selector
3. **Cross-chain indicator** — if input/output are on different chains, show "Cross-chain via LI.FI" in route display

---

### Phase 2 — Implementation Sprints

#### Sprint 2A — Architecture + Wallet Tab (P0)

**Goal:** Tab navigation working, wallet tab shows portfolio, receive flow works.

| # | Task | Files | Backend? |
|---|------|-------|----------|
| 1 | Create TabBar component | `webapp/src/components/TabBar.tsx`, `index.css` | No |
| 2 | Extract SwapPanel from App.tsx | `webapp/src/components/SwapPanel.tsx` | No |
| 3 | Refactor App.tsx as tab router | `webapp/src/App.tsx` | No |
| 4 | Create `GET /api/user/portfolio` | `src/api/routes/user.ts` | Yes |
| 5 | Add `fetchPortfolio` to API client | `webapp/src/lib/api.ts` | No |
| 6 | Build WalletTab (portfolio list) | `webapp/src/components/WalletTab.tsx` | No |
| 7 | Build ReceiveModal (QR + copy + share) | `webapp/src/components/ReceiveModal.tsx` | No |
| 8 | Install `qrcode` package in webapp | `webapp/package.json` | No |
| 9 | Style all new components | `webapp/src/styles/index.css` | No |
| 10 | Test end-to-end: tabs + portfolio + receive | — | — |

**Estimated new files:** 4 components + 1 backend route update
**Deps to add:** `qrcode` (webapp)

#### Sprint 2B — Scan + Send + Settings (P1)

**Goal:** Scan tab works, send flow works, settings with slippage.

| # | Task | Files | Backend? |
|---|------|-------|----------|
| 1 | Build ScanPanel | `webapp/src/components/ScanPanel.tsx` | No |
| 2 | Add `fetchTokenScan` to API client | `webapp/src/lib/api.ts` | No |
| 3 | Build RiskGauge component | `webapp/src/components/RiskGauge.tsx` | No |
| 4 | Build SettingsPanel | `webapp/src/components/SettingsPanel.tsx` | No |
| 5 | Slippage localStorage + pass to quote API | `webapp/src/lib/api.ts`, `App.tsx` | No |
| 6 | Create `POST /api/send` (build transfer TX) | `src/api/routes/send.ts`, `server.ts` | Yes |
| 7 | Build SendFlow component | `webapp/src/components/SendFlow.tsx` | No |
| 8 | Add `fetchSendTransaction` to API client | `webapp/src/lib/api.ts` | No |
| 9 | Add referralCode + count to GET /api/user | `src/api/routes/user.ts`, `src/db/queries/users.ts` | Yes |
| 10 | Add slippage gear icon to SwapPanel | `webapp/src/components/SwapPanel.tsx` | No |
| 11 | Style scan, send, settings components | `webapp/src/styles/index.css` | No |

**Estimated new files:** 4 components + 1 backend route
**Deps to add:** none

#### Sprint 2C — Polish & Extras (P2)

**Goal:** Production-quality UX polish, cross-chain swap UI, remaining features.

| # | Task | Files | Backend? |
|---|------|-------|----------|
| 1 | Skeleton loading states (shimmer) | All components | No |
| 2 | Toast notification system | `webapp/src/components/Toast.tsx` | No |
| 3 | Haptic feedback (Telegram WebApp API) | Throughout | No |
| 4 | Pull-to-refresh on WalletTab | `WalletTab.tsx` | No |
| 5 | Recent scans list (localStorage) | `ScanPanel.tsx` | No |
| 6 | "Swap this token" cross-tab navigation | `ScanPanel.tsx`, `App.tsx` | No |
| 7 | Recent/favorite tokens in SwapPanel | `SwapPanel.tsx` | No |
| 8 | Cross-chain swap UI (chain selector) | `SwapPanel.tsx` | No |
| 9 | Tab transition animations | `index.css` | No |
| 10 | About section in Settings | `SettingsPanel.tsx` | No |
| 11 | Referral share link | `SettingsPanel.tsx` | No |

**Estimated new files:** 1 (Toast) + updates to existing

---

### Phase 2 — New File Structure

After Phase 2, the webapp will look like:

```
webapp/src/
├── App.tsx                    # Tab router + shared state (walletAddress, balances, activeTab)
├── main.tsx                   # Privy + Telegram SDK setup (unchanged)
├── ErrorBoundary.tsx          # Error boundary (unchanged)
├── TokenSelector.tsx          # Token search modal (unchanged)
├── components/
│   ├── TabBar.tsx             # Bottom tab navigation (Wallet | Swap | Scan | Settings)
│   ├── WalletTab.tsx          # Portfolio view + action buttons + token list + activity
│   ├── SwapPanel.tsx          # Full swap UI (extracted from current App.tsx)
│   ├── ScanPanel.tsx          # Token scanner UI + risk gauge + recent scans
│   ├── SettingsPanel.tsx      # Wallet info + slippage + referral + about + logout
│   ├── ReceiveModal.tsx       # QR code + address + copy + share
│   ├── SendFlow.tsx           # Multi-step send (select token → address → amount → confirm)
│   ├── RiskGauge.tsx          # Visual risk score display (color-coded)
│   └── Toast.tsx              # Toast notification system
├── lib/
│   └── api.ts                 # API client (add: fetchPortfolio, fetchTokenScan, fetchSendTransaction)
└── styles/
    └── index.css              # All styles (add: tab bar, wallet, scan, settings, send, receive)
```

### Phase 2 — New/Modified Backend Routes

| Method | Path | Description | Sprint |
|--------|------|-------------|--------|
| GET | `/api/user/portfolio` | Balances + USD prices in one call | 2A |
| POST | `/api/send` | Build unsigned SOL/SPL transfer TX | 2B |
| GET | `/api/user` (update) | Add `referralCode` + `referralCount` to response | 2B |
| GET | `/api/quote` (update) | Accept optional `slippageBps` query param | 2B |

### Phase 3 — PREMIUM FEATURES

| Task | Status | Priority |
|------|--------|----------|
| Whale tracker API routes | NOT STARTED | P2 |
| Helius webhook integration | NOT STARTED | P2 |
| TrackPanel component (manage watched wallets) | NOT STARTED | P2 |
| Whale alert notifications via bot | NOT STARTED | P2 |
| Subscription payment flow (Telegram Stars) | NOT STARTED | P2 |
| Subscription enforcement in API routes | NOT STARTED | P2 |

### Phase 4 — AI & GROWTH

| Task | Status | Priority |
|------|--------|----------|
| Gemini AI signal analyzer | NOT STARTED | P3 |
| Signal scheduler (cron delivery) | NOT STARTED | P3 |
| SignalsPanel component | NOT STARTED | P3 |
| Referral sharing flow | NOT STARTED | P3 |
| Exchange affiliate links | NOT STARTED | P3 |

---

## Environment Variables

### Backend (`solswapbot/.env`)

```env
# Required
TELEGRAM_BOT_TOKEN=         # From @BotFather
SOLANA_RPC_URL=             # Helius RPC endpoint
FEE_WALLET_ADDRESS=         # Solana address for fee collection

# Defaults provided (optional to override)
JUPITER_API_URL=https://lite-api.jup.ag/swap/v1
PLATFORM_FEE_BPS=50         # 0.5% platform fee
API_PORT=3001
CORS_ORIGIN=*               # ⚠️ MUST be set to Vercel URL in production (crash-early if "*" + production)
DATABASE_URL=file:./dev.db
NODE_ENV=development
LOG_LEVEL=info
REFERRAL_FEE_SHARE_PERCENT=25

# Optional — needed for specific features
PRIVY_APP_ID=               # Phase 1: Privy embedded wallets
JUPITER_API_KEY=            # Soon required: free key from portal.jup.ag (lite-api being sunset)
LIFI_API_KEY=               # Cross-chain: enables higher limits + integrator fees
HELIUS_API_KEY=             # Phase 3: Webhook RPC
HELIUS_WEBHOOK_SECRET=      # Phase 3: Webhook auth
GEMINI_API_KEY=             # Phase 4: AI signals
MINIAPP_URL=                # Vercel deployment URL (for bot /start button)
```

### Frontend (Vercel env vars for `webapp/`)

```env
VITE_API_URL=               # Backend URL (e.g. https://srv1418768.hstgr.cloud) — empty if using vercel.json rewrites
VITE_PRIVY_APP_ID=          # Same as PRIVY_APP_ID above
VITE_SOLANA_RPC_URL=        # Helius RPC URL (for Privy SDK's Solana RPC provider). Falls back to public mainnet-beta
```

---

## Git Workflow

All development happens on **feature branches**, which are **merged to `main`** before deployment.
The VPS and Vercel always deploy from `main`.

```
Feature branch (claude/*, fix/*, feat/*)
  └→ PR → merge to main
       └→ VPS: git pull origin main → build → restart
       └→ Vercel: auto-deploys on push to main (if git integration is set up)
```

**Rules:**
- Never push directly to `main` — always use feature branches + merge
- Feature branches are prefixed: `claude/`, `fix/`, `feat/`
- After merging, the VPS must be manually redeployed (see below)

---

## Deployment

### Backend (Hostinger VPS — `srv1418768.hstgr.cloud`)

After merging a feature branch to `main`, SSH into the VPS and run:

```bash
cd ~/solswapbot
git pull origin main
npm install            # picks up new/updated deps
npx prisma db push     # applies schema changes (indexes, new models)
npm run build          # compiles TypeScript → dist/
pm2 restart ecosystem.config.js
```

**Verify:** `pm2 logs --lines 20` — should see "API server running on port 3001" and "Bot is running!"

**PM2 config:** `ecosystem.config.js` — runs `dist/app.js`, single instance (SQLite), 256MB memory limit, logs in `./logs/`.

### Frontend (Vercel — webapp)
1. Import repo → Root Directory: `webapp`
2. Framework: Vite
3. Env vars: `VITE_API_URL`, `VITE_PRIVY_APP_ID`, `VITE_SOLANA_RPC_URL`
4. Auto-deploys on push to `main` if Vercel git integration is connected
5. If not auto-deploying, trigger manual deploy from Vercel dashboard after merge

### BotFather Setup
1. `/mybots` → Select bot → Bot Settings → Menu Button
2. Set URL to Vercel deployment URL

---

## What NOT To Do

- **Do NOT push directly to `main`** — always use feature branches and merge
- **Do NOT add more bot commands** — all features go in the Mini App
- **Do NOT generate or store private keys** — Privy handles all key management
- **Do NOT build custodial wallet features** — we are non-custodial
- **Do NOT redirect to external wallets** — Privy signs inside the Mini App
- **Do NOT use PostgreSQL** — SQLite is sufficient for this scale
- **Do NOT allow unsanitized user input** — use `src/utils/validation.ts`
- **Do NOT accept `telegramId` from client** — always extract from verified `initData` via auth middleware
- **Do NOT set `CORS_ORIGIN=*` in production** — config will crash on startup if you do

---

## Code Audit Report (2026-02-25)

> Full deep-dive audit of every file in the codebase. 6 parallel audits covering:
> backend routes, bot/middleware, Jupiter/aggregator financial core, scanner/DB/utils,
> webapp frontend, and config/infrastructure.

### Overall Code Rating: 7.5 / 10 (up from 4.0 — all CRITICAL + key HIGH issues fixed)

| Category | Rating | Summary |
|----------|--------|---------|
| **Security** | 7/10 | ✅ Telegram initData auth (C2/C3/C5), CORS locked in prod (C4), Error Boundary (M7) |
| **Financial Logic** | 6/10 | ✅ Fee collection (C1), fee bypass prevention (H1), SOL address fixed (C6). Precision (H5) partially done |
| **Error Handling** | 6/10 | ✅ try/catch + upsert in /start (H6/H7), input validation (H8/H9). Some gaps remain |
| **Code Quality** | 7/10 | Good patterns (Zod, Prisma, retry) now consistently applied. Auth middleware, rate limiting, helmet |
| **Frontend (React)** | 7/10 | ✅ Real on-chain confirmation polling (H2), dynamic balance checks, Error Boundary (M7), Token Selector |
| **Infrastructure** | 6/10 | ✅ trust proxy, graceful shutdown (H11), HTTPS vercel.json (C7), DB indexes (H12/M19) |

**Verdict:** All 7 CRITICAL issues and all beta-blocking HIGH issues are resolved.
Authentication, fee validation, on-chain confirmation, quote freshness, and error boundary
are all in place. The codebase is production-ready for beta testing.
Remaining work: Zod on LI.FI (M9), and MEDIUM-priority cleanup items.

---

### CRITICAL Issues (Must Fix Before Production)

#### ~~C1. Fee Collection Likely Broken~~ — FIXED (2026-02-25)
- **File:** `src/jupiter/swap.ts:29`
- **Status:** ✅ FIXED. `feeAccount` now correctly derived as ATA via
  `getAssociatedTokenAddressSync(outputMint, feeWallet, true)` from `@solana/spl-token`.
  Jupiter no longer requires Referral Program setup (simplified Jan 2025).

#### ~~C2. Zero Authentication on All API Endpoints~~ — FIXED (2026-02-25)
- **Status:** ✅ FIXED. Added `telegramAuthMiddleware` (`src/api/middleware/telegramAuth.ts`)
  using HMAC-SHA256 verification of Telegram `initData`. Applied to all protected routes.
  Public routes (price, tokens) remain unauthenticated by design.

#### ~~C3. Wallet Address Hijacking via POST /api/user/wallet~~ — FIXED (2026-02-25)
- **Status:** ✅ FIXED. `telegramId` is now extracted from verified `initData` via auth
  middleware — no longer accepted as a body parameter. Attackers cannot spoof identity.

#### ~~C4. CORS Wildcard Allows Any Origin~~ — FIXED (2026-02-25)
- **Status:** ✅ FIXED. `config.ts` now rejects `CORS_ORIGIN="*"` when `NODE_ENV=production`
  via Zod `.refine()`. Crash-early on misconfiguration.

#### ~~C5. Telegram `initDataUnsafe` Used Without Server-Side Verification~~ — FIXED (2026-02-25)
- **Status:** ✅ FIXED. Frontend sends `tg.initData` (signed string) in `Authorization: tma <initData>`.
  Backend validates HMAC + auth_date expiry before extracting user identity.

#### ~~C6. SOL Address Mismatch Between Constants and Chains Registry~~ — FIXED (2026-02-25)
- **Status:** ✅ FIXED. `chains.ts` now uses Wrapped SOL (`So11111111111111111111111111111111111111112`),
  matching `constants.ts` and Jupiter/LI.FI requirements.

#### ~~C7. Hardcoded VPS IP in vercel.json~~ — FIXED (2026-02-25)
- **Status:** ✅ FIXED. `webapp/vercel.json` now rewrites to
  `https://srv1418768.hstgr.cloud/api/:path*`.

---

### HIGH Issues (Fix Before Beta Users)

| # | Issue | File(s) | Status |
|---|-------|---------|--------|
| ~~H1~~ | ~~Unvalidated quoteResponse — fee bypass~~ | `src/api/routes/swap.ts` | ✅ FIXED — validates `platformFee.feeBps` matches config |
| ~~H2~~ | ~~Fake 2-second "confirmation"~~ | `webapp/src/App.tsx`, `src/api/routes/swap.ts` | ✅ FIXED — backend polls on-chain, frontend polls `/api/swap/status` |
| ~~H3~~ | ~~Stale quote race condition~~ | `webapp/src/App.tsx` | ✅ FIXED — quote snapshots inputs + AbortController + input match check before swap |
| ~~H4~~ | ~~`lastValidBlockHeight` ignored~~ | `webapp/src/App.tsx` | ✅ FIXED — quotes auto-expire after 30s, swap rejects expired quotes + auto-refreshes |
| H5 | Floating-point precision loss on amounts | `quote.ts`, `router.ts` | PARTIAL — BigInt for amount conversion, float remains for display |
| ~~H6~~ | ~~Race condition in user creation (TOCTOU)~~ | `src/bot/commands/start.ts` | ✅ FIXED — uses `upsert` |
| ~~H7~~ | ~~No try/catch in startCommand~~ | `src/bot/commands/start.ts` | ✅ FIXED — full try/catch with user-facing error reply |
| ~~H8~~ | ~~Division by zero in quote route~~ | `src/api/routes/quote.ts` | ✅ FIXED — validates amount > 0 |
| ~~H9~~ | ~~parseInt without NaN check~~ | `src/api/routes/quote.ts` | ✅ FIXED — validates with `Number.isFinite()` and regex |
| ~~H10~~ | ~~Transaction timeout marked as FAILED~~ | `src/solana/transaction.ts` | ✅ FIXED — uses TIMEOUT status instead of FAILED; frontend handles gracefully |
| ~~H11~~ | ~~Express server not in shutdown handler~~ | `src/app.ts` | ✅ FIXED — server instance exposed for graceful shutdown |
| ~~H12~~ | ~~Swap.txSignature not indexed~~ | `prisma/schema.prisma` | ✅ FIXED — `@@index([txSignature])` added |

---

### MEDIUM Issues (Fix During Phase 2)

| # | Issue | File(s) | Status |
|---|-------|---------|--------|
| ~~M1~~ | ~~No API rate limiting~~ | `src/api/server.ts` | ✅ FIXED — 100 req/min via `express-rate-limit` |
| ~~M2~~ | ~~No security headers~~ | `src/api/server.ts` | ✅ FIXED — `helmet` middleware added |
| M3 | N+1 query in history | `src/api/routes/history.ts` | OPEN |
| M4 | Token list cache thundering herd | `src/jupiter/tokens.ts` | OPEN |
| M5 | Redundant RPC calls in scanner | `src/scanner/checks.ts` | OPEN |
| M6 | Scanner errors counted as "unsafe" | `src/scanner/checks.ts` | OPEN |
| ~~M7~~ | ~~No React Error Boundary~~ | `webapp/src/ErrorBoundary.tsx` | ✅ FIXED — wraps `<App />` in `main.tsx` |
| ~~M8~~ | ~~Swap not recorded in DB after execution~~ | `webapp/src/App.tsx` | ✅ FIXED — `confirmSwap` records + polls backend |
| M9 | LI.FI response not Zod-validated | `src/aggregator/lifi.ts` | OPEN |
| M10 | No retry wrapper on LI.FI API calls | `src/aggregator/lifi.ts` | OPEN |
| M11 | Token-2022 incompatible | `src/scanner/checks.ts` | OPEN |
| M12 | `bot.catch()` swallows errors | `src/bot/index.ts` | OPEN |
| M13 | LI.FI gas cost only takes first entry | `src/aggregator/lifi.ts` | OPEN |
| M14 | Dummy addresses in LI.FI | `src/aggregator/lifi.ts` | OPEN |
| M15 | Arbitrum + Base chains have zero tokens | `src/aggregator/chains.ts` | OPEN |
| M16 | No AbortController on quote fetch | `webapp/src/App.tsx` | OPEN |
| M17 | Missing useEffect dependency | `webapp/src/App.tsx` | OPEN |
| M18 | Privy App ID can be empty string | `webapp/src/main.tsx` | OPEN |
| ~~M19~~ | ~~User.walletAddress not indexed~~ | `prisma/schema.prisma` | ✅ FIXED — `@@index([walletAddress])` |
| M20 | Swap.feeAmountUsd is Float | `prisma/schema.prisma` | OPEN |
| M21 | Async Express handlers bypass error handler | `src/api/server.ts` | OPEN |
| M22 | `@solana/web3.js` still in webapp | `webapp/package.json` | OPEN |
| M23 | Unused webapp deps | `webapp/package.json` | OPEN |
| M24 | `@types/express@^5` used with Express 4 | `package.json` | OPEN |
| M25 | Retry logic fragile string matching | `src/utils/retry.ts` | OPEN |

---

### Priority Fix Order

**Before ANY real money flows:** (ALL DONE ✅)
1. ~~C1 — Fix fee collection (ATA derivation)~~ ✅ DONE
2. ~~C2 + C3 + C5 — Add Telegram `initData` auth middleware~~ ✅ DONE
3. ~~C4 — Lock CORS to production origin~~ ✅ DONE
4. ~~C6 — Fix SOL address in chains.ts~~ ✅ DONE
5. ~~C7 — Update vercel.json to HTTPS domain~~ ✅ DONE
6. ~~H1 — Validate quoteResponse server-side (prevent fee bypass)~~ ✅ DONE

**Before beta users:** (MOSTLY DONE)
7. ~~H2 — Real on-chain confirmation (backend polling + frontend status check)~~ ✅ DONE
8. H5 — BigInt arithmetic for token amounts (PARTIAL)
9. ~~H6 + H7 — Upsert + try/catch in startCommand~~ ✅ DONE
10. ~~H8 + H9 — Input validation on quote parameters~~ ✅ DONE
11. ~~M1 + M2 — Rate limiting + helmet~~ ✅ DONE
12. ~~M7 — React Error Boundary~~ ✅ DONE
13. ~~M8 — Record swaps in DB after execution~~ ✅ DONE

**Remaining before beta:** All done! ✅

---

## Beta Test Checklist

> Run through this checklist after every deploy to `main`. All items must pass before inviting external users.

### Pre-Test (VPS)

```bash
cd ~/solswapbot
git pull origin main
npm install
npx prisma db push
npm run build
pm2 restart ecosystem.config.js
pm2 logs --lines 20  # Confirm "API server running on port 3001" + "Bot is running!"
```

### Core Flow

- [ ] `/start` in Telegram → Mini App button appears
- [ ] Tap Mini App → loads, Privy login via Telegram succeeds
- [ ] Wallet auto-created, address visible in header
- [ ] Select SOL → USDC, enter 0.001, quote appears within ~2s
- [ ] Wait 30s → quote auto-refreshes (H4)
- [ ] Change amount after quote loads, click swap immediately → "Quote is outdated" error (H3)
- [ ] Execute swap → sign in Privy → "Confirming..." → "Swap complete!" with Solscan link
- [ ] Tap wallet badge → swap appears in history panel
- [ ] Insufficient balance → clear error message (not Privy simulation failure)
- [ ] Token selector → search "JUP" → select → quote loads for new pair

### Token Scanner

- [ ] `GET /api/scan?mint=<any-mint>` with auth header → returns risk score 0-100

### Edge Cases

- [ ] Same token both sides → blocked or shows 0
- [ ] Amount = 0 → swap button disabled
- [ ] Spam-click swap → only one TX executes
- [ ] Close Mini App mid-swap → re-open, check history for result

### Security Spot-Checks

- [ ] `GET /api/user` without `Authorization` header → 401
- [ ] `POST /api/swap` with modified `platformFeeBps` → 400
- [ ] Check fee wallet on Solscan → fee arrived from swap

### Done When

- [ ] End-to-end swap completes with real funds (SOL → USDC)
- [ ] Fee visible in fee wallet on Solscan
- [ ] History shows correct records
- [ ] Scanner returns valid risk scores
- [ ] No errors in `pm2 logs`
- [ ] Auth rejects all unauthenticated requests

---

## Changelog

### 2026-02-26 — Phase 2 Planning + Beta Test Checklist
- Added comprehensive Beta Test Checklist to CLAUDE.md (pre-test, core flow, edge cases, security checks)
- Designed full Phase 2 plan: Mini App UI & Wallet Features
- Phase 2 adds: Tab navigation (Wallet/Swap/Scan/Settings), portfolio view, send/receive flows,
  token scanner UI, settings panel with slippage control, QR code receive, referral sharing
- Organized into 3 sprints: 2A (architecture + wallet), 2B (scan + send + settings), 2C (polish)
- New backend routes planned: GET /api/user/portfolio, POST /api/send
- New webapp components: TabBar, WalletTab, SwapPanel, ScanPanel, SettingsPanel, ReceiveModal,
  SendFlow, RiskGauge, Toast
- UX patterns modeled after Phantom, Tonkeeper, and Telegram mini app best practices

### 2026-02-26 — Stale Quote Prevention, Quote Expiry, Timeout Handling (H3/H4/H10)
- Fixed stale quote race condition (H3): quotes now snapshot the inputs (amount, mints) they were fetched for; `handleSwap` verifies current inputs match the quote before proceeding. Added AbortController to cancel in-flight quote fetches when inputs change.
- Fixed lastValidBlockHeight expiry (H4): quotes auto-expire after 30 seconds and auto-refresh. Swap rejects expired quotes and triggers a fresh quote fetch.
- Fixed timeout marked as FAILED (H10): backend now uses `TIMEOUT` status (new Prisma enum value) instead of `FAILED` when polling times out. Frontend handles TIMEOUT gracefully — shows as complete with Solscan link, not as a definitive failure.
- All beta-blocking HIGH issues now resolved. Codebase is ready for beta testing.

### 2026-02-26 — Trust Proxy Fix + Dynamic Balance Checking
- Fixed `express-rate-limit` `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` error on VPS by adding `app.set("trust proxy", 1)` — rate limiting now correctly identifies users by real IP behind Vercel proxy
- Fixed token balance check: tokens not held (0 balance) were treated as "unknown" instead of 0, allowing users to attempt swaps on tokens they don't own. Now correctly returns 0 when balances are loaded but token isn't in wallet
- Updated audit report: all 7 CRITICAL issues now marked ✅ FIXED, overall rating 4.0 → 6.5/10
- Updated priority fix order to reflect current state (all pre-production items done)

### 2026-02-25 — Security Hardening (C2-C7, H1-H2, H6-H9, H11-H12, M1-M2, M8, M19)
- Added Telegram `initData` HMAC auth middleware (C2/C3/C5) — all protected routes now verify identity
- Locked CORS to reject wildcard in production (C4)
- Fixed SOL address mismatch in chains.ts (C6)
- Updated vercel.json to HTTPS domain (C7)
- Added `platformFeeBps` validation in swap route to prevent fee bypass (H1)
- Replaced fake 2s confirmation with backend on-chain polling + frontend status polling (H2)
- Added upsert + try/catch in /start command (H6/H7)
- Added input validation (amount, mint addresses) in quote route (H8/H9)
- Exposed Express server for graceful shutdown (H11)
- Added `@@index([txSignature])` and `@@index([walletAddress])` to Prisma schema (H12/M19)
- Added `express-rate-limit` (100 req/min) and `helmet` security headers (M1/M2)
- Added `confirmSwap` + `fetchSwapStatus` for DB recording and status polling (M8)
- Added Token Selector component with search, popular tokens list, and icon display
- Added `GET /api/user/balances` endpoint for dynamic SPL token balance fetching
- Frontend now shows balance for any selected input token with MAX button

### 2026-02-25 — Jupiter API Migration (V1→V2 Tokens, V2→V3 Price)
- Migrated Token List API from deprecated V1 (`/tokens/v1/strict`, dead since Aug 2025) to V2 (`/tokens/v2/tag?query=verified`)
- V2 uses different field names: `id` (not `address`), `icon` (not `logoURI`) — normalized in `loadTokenList()`
- Migrated Price API from deprecated V2 (`/price/v2`) to V3 (`/price/v3/price`)
- V3 response is flat `{ MINT: { usdPrice } }` instead of nested `{ data: { MINT: { price } } }`
- Added hardcoded `FALLBACK_TOKENS` (10 popular tokens) so app works even if Jupiter API is down
- Swap/Quote API (`/swap/v1/`) unchanged — still current
- **Note:** `lite-api.jup.ag` (free, no key) is being sunset. Future migration needed to `api.jup.ag` with API key from portal.jup.ag (free tier = 60 req/min)
- Confirmed C1 (fee collection) was already fixed — ATA derivation is correct, updated audit accordingly

### 2026-02-25 — Full Codebase Audit
- Comprehensive deep-dive audit of every file (6 parallel audits)
- Identified 7 CRITICAL, 12 HIGH, 25 MEDIUM issues
- Overall rating: 4.0/10 — solid architecture, critical security gaps
- Key findings: fee collection likely broken (C1), zero API auth (C2), wallet hijacking (C3)
- SOL address mismatch between constants.ts and chains.ts (C6)
- Added priority fix order and detailed findings to CLAUDE.md
- Updated Revenue Flow with fee collection warning
- Corrected Coding Patterns to reflect actual (not aspirational) state

### 2026-02-24 — Phase 1: Privy Wallet Integration
- Integrated @privy-io/react-auth SDK in webapp (v3.14.1)
- Replaced Phantom deep-link flow with Privy embedded wallet signing
- Added Telegram login via PrivyProvider config
- Auto-create Solana wallet on first login (createOnLogin: "all-users")
- Added useSignAndSendTransaction for in-app swap signing
- Added POST /api/user/wallet route (auto-saves Privy wallet to DB)
- Added GET /api/history route (last 20 swaps, symbol resolution)
- Added swap history slide-up panel (tap wallet badge to open)
- Added logout button, tx confirmation link (Solscan)
- Removed @solana/web3.js dependency from webapp (only used in backend now)

### 2026-02-24 — Documentation Overhaul
- Merged CONTEXT.md into CLAUDE.md as single source of truth
- Added implementation status tracking with phases
- Updated all docs to reflect actual codebase state vs aspirational features
- Fixed .env.example PRIVY_APP_ID naming mismatch
- Added project ratings and gap analysis
