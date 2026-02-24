# CLAUDE.md — SolSwap Master Context & Development Guide

> **This is the single source of truth for the SolSwap project.**
> Updated: 2026-02-24 | Version: 0.1.0
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
| Solana DEX | Jupiter API (swap + quote + price) |
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
     └→ 0.5% fee auto-collected into FEE_WALLET_ADDRESS
        └→ On-chain, trustless — we just pass the param

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

1. **Zod validation** on all external API responses
2. **Prisma queries** in `src/db/queries/` — one file per domain
3. **Retry wrapper** via `src/utils/retry.ts` for all HTTP calls
4. **Input sanitization** via `src/utils/validation.ts`
5. **Config validated at startup** — crash early on missing env vars
6. **Smart routing** — `src/aggregator/router.ts` auto-selects Jupiter (same-chain) vs LI.FI (cross-chain)

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

## Changelog

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
