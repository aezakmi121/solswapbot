# CLAUDE.md — SolSwap Master Context & Development Guide

> **This is the single source of truth for the SolSwap project.**
> Updated: 2026-02-25 | Version: 0.1.0
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
│  │ /start   │    │ Swap | Scan | Track│ │
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
│   ├── app.ts                 # Entry point — starts bot + API server
│   ├── config.ts              # Zod-validated env config (crash-early)
│   ├── api/
│   │   ├── server.ts          # Express setup, CORS, error handler
│   │   └── routes/
│   │       ├── quote.ts       # GET /api/quote (Jupiter + USD breakdown)
│   │       ├── swap.ts        # POST /api/swap (unsigned TX builder)
│   │       ├── price.ts       # GET /api/price/:mint
│   │       ├── tokens.ts      # GET /api/tokens
│   │       ├── user.ts        # GET /api/user
│   │       ├── scan.ts        # GET /api/scan (token safety)
│   │       ├── crossChain.ts  # GET /api/cross-chain/quote|chains|tokens
│   │       └── history.ts    # GET /api/history (last 20 swaps)
│   ├── bot/
│   │   ├── index.ts           # Bot setup — /start + /help only, catch-all → Mini App
│   │   ├── commands/
│   │   │   └── start.ts       # /start — creates user + shows Mini App button
│   │   └── middleware/
│   │       ├── logger.ts      # Audit trail (swap, connect, start, status)
│   │       └── rateLimit.ts   # Per-user per-command limits
│   ├── jupiter/
│   │   ├── quote.ts           # Jupiter quote with platformFeeBps + Zod validation
│   │   ├── swap.ts            # Jupiter swap TX builder (passes feeAccount)
│   │   └── price.ts           # Jupiter price API v3
│   ├── aggregator/
│   │   ├── router.ts          # Smart router: Jupiter (same-chain) vs LI.FI (cross-chain)
│   │   ├── lifi.ts            # LI.FI API client (works without key)
│   │   └── chains.ts          # Chain + token registry (6 chains, 15 tokens)
│   ├── scanner/
│   │   ├── analyze.ts         # Token risk scoring (0-100, 4 checks in parallel)
│   │   └── checks.ts          # Safety checks: mint auth, freeze, top holders, age
│   ├── solana/
│   │   ├── connection.ts      # RPC connection singleton
│   │   └── transaction.ts     # TX polling + confirmation (100 attempts × 3s)
│   ├── db/
│   │   ├── client.ts          # Prisma singleton
│   │   └── queries/
│   │       ├── users.ts       # User CRUD + referral count
│   │       ├── fees.ts        # Fee aggregation queries
│   │       └── referrals.ts   # Referral earnings queries
│   └── utils/
│       ├── retry.ts           # Exponential backoff (transient errors only)
│       ├── validation.ts      # Solana address validation + input sanitization
│       ├── formatting.ts      # Token amounts + address shortening
│       └── constants.ts       # Token registry (6 tokens)
├── webapp/                    # Telegram Mini App (deployed to Vercel)
│   ├── src/
│   │   ├── App.tsx            # Main app — swap interface (single page currently)
│   │   ├── main.tsx           # React entry point
│   │   ├── lib/
│   │   │   └── api.ts         # API client + hardcoded token list
│   │   └── styles/
│   │       └── index.css      # Dark theme styles
│   ├── index.html
│   ├── vite.config.ts
│   └── vercel.json
├── prisma/
│   └── schema.prisma          # User, Swap, TokenScan, WatchedWallet, Subscription
├── package.json
├── tsconfig.json
├── ecosystem.config.js        # PM2 config for VPS (single instance, SQLite)
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

Status enum: `PENDING → SUBMITTED → CONFIRMED / FAILED`

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

## Coding Patterns

1. **Zod validation** on Jupiter API responses (NOT yet on LI.FI — see audit M9)
2. **Prisma queries** in `src/db/queries/` — one file per domain
3. **Retry wrapper** via `src/utils/retry.ts` — used for Jupiter, NOT for LI.FI or price API (see audit M10)
4. **Input sanitization** via `src/utils/validation.ts` — inconsistently applied across routes (see audit H8, H9)
5. **Config validated at startup** — crash early on missing env vars
6. **Smart routing** — `src/aggregator/router.ts` auto-selects Jupiter (same-chain) vs LI.FI (cross-chain)
7. **No authentication** — API endpoints have zero auth (see audit C2). Must add `initData` verification

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

### Phase 2 — MINI APP UI

| Task | Status | Priority |
|------|--------|----------|
| Tab navigation (Swap / Scan / Track / Signals) | NOT STARTED | P1 |
| SwapPanel component (extract from App.tsx) | NOT STARTED | P1 |
| ScanPanel component (token scanner UI) | NOT STARTED | P1 |
| WalletHeader component (balance + address) | NOT STARTED | P1 |
| TokenSelector component (search + select) | NOT STARTED | P1 |
| History section in swap tab | DONE (via slide-up panel) | P2 |

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

```env
# Required
TELEGRAM_BOT_TOKEN=         # From @BotFather
SOLANA_RPC_URL=             # Helius RPC endpoint
FEE_WALLET_ADDRESS=         # Solana address for fee collection

# Defaults provided (optional to override)
JUPITER_API_URL=https://lite-api.jup.ag/swap/v1
PLATFORM_FEE_BPS=50         # 0.5% platform fee
API_PORT=3001
CORS_ORIGIN=*
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
MINIAPP_URL=                # Vercel deployment URL (for bot button)
```

---

## Deployment

### Backend (Hostinger VPS)
```bash
git pull origin main
npm install && npm run build
npx prisma db push
pm2 restart ecosystem.config.js
```

### Frontend (Vercel)
1. Import repo → Root Directory: `webapp`
2. Framework: Vite
3. Env vars: `VITE_API_URL`, `VITE_PRIVY_APP_ID`

### BotFather Setup
1. `/mybots` → Select bot → Bot Settings → Menu Button
2. Set URL to Vercel deployment URL

---

## What NOT To Do

- **Do NOT add more bot commands** — all features go in the Mini App
- **Do NOT generate or store private keys** — Privy handles all key management
- **Do NOT build custodial wallet features** — we are non-custodial
- **Do NOT redirect to external wallets** — Privy signs inside the Mini App
- **Do NOT use PostgreSQL** — SQLite is sufficient for this scale
- **Do NOT allow unsanitized user input** — use `src/utils/validation.ts`

---

## Code Audit Report (2026-02-25)

> Full deep-dive audit of every file in the codebase. 6 parallel audits covering:
> backend routes, bot/middleware, Jupiter/aggregator financial core, scanner/DB/utils,
> webapp frontend, and config/infrastructure.

### Overall Code Rating: 4.0 / 10

| Category | Rating | Summary |
|----------|--------|---------|
| **Security** | 2/10 | No authentication, CORS wildcard, wallet hijacking, fee bypass |
| **Financial Logic** | 3/10 | ~~Fee collection likely broken~~ (FIXED), SOL address mismatch, precision loss |
| **Error Handling** | 4/10 | Inconsistent try/catch, silent failures, fake confirmation |
| **Code Quality** | 6/10 | Good patterns (Zod, Prisma, retry), but inconsistently applied |
| **Frontend (React)** | 4/10 | No error boundary, stale quotes, no real tx confirmation |
| **Infrastructure** | 5/10 | PM2 + Prisma work, but no graceful shutdown, HTTP proxy |

**Verdict:** The architecture and patterns are solid. The codebase is well-structured and
TypeScript-strict. Fee collection is now fixed (C1). However, it has **zero authentication**
and several financial logic bugs that must be fixed before handling real funds.

---

### CRITICAL Issues (Must Fix Before Production)

#### ~~C1. Fee Collection Likely Broken~~ — FIXED (2026-02-25)
- **File:** `src/jupiter/swap.ts:29`
- **Status:** ✅ FIXED. `feeAccount` now correctly derived as ATA via
  `getAssociatedTokenAddressSync(outputMint, feeWallet, true)` from `@solana/spl-token`.
  Jupiter no longer requires Referral Program setup (simplified Jan 2025).

#### C2. Zero Authentication on All API Endpoints
- **Files:** All routes in `src/api/routes/`
- **Impact:** Anyone on the internet can: read any user's wallet + balance, view any user's
  swap history, overwrite any user's wallet address, build swap transactions, run unlimited
  scans. Telegram IDs are sequential integers — trivially enumerable.
- **Fix:** Implement Telegram `initData` HMAC validation middleware. Extract `telegramId`
  from the verified payload instead of accepting it as a query/body parameter.

#### C3. Wallet Address Hijacking via POST /api/user/wallet
- **File:** `src/api/routes/user.ts:68-98`
- **Impact:** `POST { telegramId: "VICTIM", walletAddress: "ATTACKER" }` overwrites any
  user's wallet. Combined with C2, this is a direct path to fund misdirection.
- **Fix:** Auth middleware (C2) + verify wallet ownership via Privy server-side API.

#### C4. CORS Wildcard Allows Any Origin
- **File:** `src/config.ts:55` — `CORS_ORIGIN` defaults to `"*"`
- **Impact:** Any website can make authenticated requests to the API from a user's browser.
- **Fix:** Set `CORS_ORIGIN` to the exact Vercel deployment URL. Reject `"*"` when
  `NODE_ENV=production`.

#### C5. Telegram `initDataUnsafe` Used Without Server-Side Verification
- **File:** `webapp/src/App.tsx:20-26`
- **Impact:** The client reads `tg.initDataUnsafe.user.id` and sends it to the backend, which
  trusts it blindly. An attacker can forge any Telegram user ID.
- **Fix:** Send `tg.initData` (the signed string) to the backend. Validate the HMAC signature
  using the bot token before extracting the user identity.

#### C6. SOL Address Mismatch Between Constants and Chains Registry
- **Files:** `src/utils/constants.ts:3` vs `src/aggregator/chains.ts:94`
- **Impact:** `constants.ts` uses Wrapped SOL (`So111...112`, correct for Jupiter).
  `chains.ts` uses System Program (`111...111`, wrong). Any SOL swap through the cross-chain
  router endpoint fails or produces incorrect quotes.
- **Fix:** Change the SOL address in `chains.ts` to Wrapped SOL
  (`So11111111111111111111111111111111111111112`).

#### C7. Hardcoded VPS IP in vercel.json (Now HTTPS — Update URL)
- **File:** `webapp/vercel.json:4`
- **Impact:** IP `76.13.212.116` is hardcoded. SSL is now configured on the VPS domain
  (`srv1418768.hstgr.cloud`). The vercel.json should be updated to use
  `https://srv1418768.hstgr.cloud` instead of the raw HTTP IP.
- **Fix:** Update to `"destination": "https://srv1418768.hstgr.cloud/api/:path*"`.

---

### HIGH Issues (Fix Before Beta Users)

| # | Issue | File(s) | Impact |
|---|-------|---------|--------|
| H1 | Unvalidated `quoteResponse` forwarded to Jupiter — fee bypass | `src/api/routes/swap.ts:16` | Attacker can strip `platformFeeBps` from quote and get zero-fee swaps |
| H2 | Fake 2-second "confirmation" — no on-chain check | `webapp/src/App.tsx:203` | Shows "confirmed" after 2s timeout, tx may still be pending/failed |
| H3 | Stale quote race condition | `webapp/src/App.tsx:176-208` | User changes amount between quote and swap, executes at wrong price |
| H4 | `lastValidBlockHeight` ignored | `webapp/src/App.tsx:184` | Transaction submitted after block height expires = guaranteed failure |
| H5 | Floating-point precision loss on amounts | `webapp/App.tsx:140`, `router.ts:68`, `quote.ts:45` | `0.1 * 10**18` loses precision for EVM tokens. Use BigInt or string math |
| H6 | Race condition in user creation (TOCTOU) | `src/bot/commands/start.ts:18-57` | Double `/start` = unique constraint violation, unhandled. Use `upsert` |
| H7 | No try/catch in `startCommand` | `src/bot/commands/start.ts` | DB failure = silent error, user gets no response |
| H8 | Division by zero in quote route | `src/api/routes/quote.ts:49` | `amount=0` → `exchangeRate = Infinity` → broken JSON response |
| H9 | `parseInt` without NaN check | `src/api/routes/quote.ts:31-32` | `inDec=abc` → `NaN` cascades through all calculations |
| H10 | Transaction timeout marked as FAILED | `src/solana/transaction.ts:59-65` | Slow-confirming tx marked FAILED in DB but succeeds on-chain |
| H11 | Express server not in shutdown handler | `src/app.ts:14` | Open HTTP connections severed on shutdown, in-flight requests lost |
| H12 | `Swap.txSignature` not indexed | `prisma/schema.prisma:40` | Full table scan on every signature lookup. Add `@@index([txSignature])` |

---

### MEDIUM Issues (Fix During Phase 2)

| # | Issue | File(s) |
|---|-------|---------|
| M1 | No API rate limiting (only bot has limits) | `src/api/server.ts` |
| M2 | No security headers — add `helmet` | `src/api/server.ts` |
| M3 | N+1 query in history (40 linear scans per request) | `src/api/routes/history.ts:39-53` |
| M4 | Token list cache thundering herd | `src/jupiter/tokens.ts:34-51` |
| M5 | Redundant RPC calls in scanner (2x getAccountInfo, 2x getTokenSupply) | `src/scanner/checks.ts` |
| M6 | Scanner errors counted as "unsafe" (false positive risk scores) | `src/scanner/checks.ts:47,83,126,208` |
| M7 | No React Error Boundary — white screen on crash | `webapp/src/` |
| M8 | Swap not recorded in DB after execution | `webapp/src/App.tsx:176-208` |
| M9 | LI.FI response not Zod-validated (violates project pattern) | `src/aggregator/lifi.ts:116` |
| M10 | No retry wrapper on LI.FI API calls | `src/aggregator/lifi.ts:88` |
| M11 | Token-2022 incompatible (hardcoded SPL Token byte offsets) | `src/scanner/checks.ts:30-31,67-68` |
| M12 | `bot.catch()` swallows errors — only logs `.message`, loses stack/context | `src/bot/index.ts:63-65` |
| M13 | LI.FI gas cost only takes first entry (understates multi-hop fees) | `src/aggregator/lifi.ts:126` |
| M14 | Dummy addresses in LI.FI produce unusable `transactionRequest` | `src/aggregator/lifi.ts:65-70` |
| M15 | Arbirtum + Base chains have zero tokens registered | `src/aggregator/chains.ts:70-115` |
| M16 | No AbortController on quote fetch — out-of-order responses | `webapp/src/App.tsx:161` |
| M17 | Missing useEffect dependency: `loginWithTelegram` | `webapp/src/App.tsx:58-64` |
| M18 | Privy App ID can be empty string — silent SDK failure | `webapp/src/main.tsx:28` |
| M19 | `User.walletAddress` not indexed in Prisma schema | `prisma/schema.prisma:15` |
| M20 | `Swap.feeAmountUsd` is Float — precision loss for financial aggregation | `prisma/schema.prisma:39` |
| M21 | Async Express handlers bypass global error handler | `src/api/server.ts:45-55` |
| M22 | `@solana/web3.js` still in webapp despite changelog saying removed | `webapp/package.json` |
| M23 | Unused webapp deps: `@solana-program/compute-budget`, `@solana-program/memo` | `webapp/package.json` |
| M24 | `@types/express@^5` used with Express 4 runtime | `package.json` |
| M25 | Retry logic uses fragile string matching (`"429"`, `"503"`) | `src/utils/retry.ts:19-24` |

---

### Priority Fix Order

**Before ANY real money flows:**
1. ~~C1 — Fix fee collection (ATA derivation)~~ ✅ DONE
2. C2 + C3 + C5 — Add Telegram `initData` auth middleware
3. C4 — Lock CORS to production origin
4. C6 — Fix SOL address in chains.ts
5. C7 — Update vercel.json to HTTPS domain
6. H1 — Validate quoteResponse server-side (prevent fee bypass)

**Before beta users:**
7. H2 + H4 — Real on-chain confirmation (use backend polling or RPC check)
8. H5 — BigInt arithmetic for token amounts
9. H6 + H7 — Upsert + try/catch in startCommand
10. H8 + H9 — Input validation on quote parameters
11. M1 + M2 — Rate limiting + helmet
12. M7 — React Error Boundary
13. M8 — Record swaps in DB after execution

---

## Changelog

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
