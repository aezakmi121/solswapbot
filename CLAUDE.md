# CLAUDE.md — Project Context for Claude Code

> This file is the single source of truth for this project. Read it fully at the start of every session before writing or editing any code.

---

## Project Overview

**Name:** SolSwap Bot (working name — rename as needed)
**Type:** Telegram trading bot for Solana tokens
**Model:** Non-custodial swap bot powered by Jupiter API
**Revenue:** 0.5% platform fee on every swap via Jupiter's `platformFeeBps` parameter
**Goal:** Passive fee income — build once, earn on every trade forever

### What This Bot Does
Users connect their own Phantom wallet. The bot constructs a Jupiter swap transaction with our fee baked in. The user signs the transaction themselves via a Phantom deeplink. Our fee wallet receives 0.5% of every swap automatically, on-chain, without us ever holding user funds.

### What This Bot Does NOT Do
- We NEVER hold, store, or have access to user private keys
- We NEVER store seed phrases or signing keys of any kind
- We are NOT a custodial service — users own their own funds at all times
- We do NOT execute trades autonomously on behalf of users

---

## Tech Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Runtime | Node.js | 20 LTS | Stable, Jupiter SDK is JS-native |
| Language | TypeScript | 5.x | Type safety, better DX |
| Bot Framework | Grammy | Latest | Modern Telegram bot framework, better than telegraf |
| Jupiter API | @jup-ag/api | Latest | Official Jupiter TypeScript SDK |
| Solana | @solana/web3.js | Latest | Transaction construction and submission |
| ORM | Prisma | Latest | Schema-first, easy SQLite→Postgres migration |
| Database | SQLite (dev/prod until scale) | — | Zero setup, migrate to Postgres at ~500 DAU |
| Validation | Zod | Latest | Runtime type validation for API responses |
| HTTP Client | Native fetch (Node 20) | — | No axios needed |
| Environment | dotenv | Latest | Env var management |
| Process Manager | PM2 | Latest | Keep bot alive in production |
| Deployment | VPS (Ubuntu 22.04) | — | $5–10/month Hetzner or DigitalOcean |

---

## Project File Structure

```
solana-swap-bot/
├── CLAUDE.md                    ← You are here
├── README.md                    ← Human-readable project intro
├── ARCHITECTURE.md              ← System design and data flows
├── SECURITY.md                  ← Threat model and security rules
├── API.md                       ← Jupiter API reference and integration notes
├── TESTING.md                   ← Testing guide (devnet, mainnet, checklist)
├── DEPLOY.md                    ← Production deployment guide (VPS, PM2, backups)
├── .env                         ← Local secrets (NEVER commit)
├── .env.example                 ← Template with all required vars (commit this)
├── .env.devnet                  ← Devnet testing env template
├── .gitignore
├── package.json
├── tsconfig.json
├── ecosystem.config.js          ← PM2 production config
├── prisma/
│   └── schema.prisma            ← Single source of truth for DB schema
├── src/
│   ├── app.ts                   ← Entry point — initializes bot and DB
│   ├── config.ts                ← Loads and validates all env vars via Zod
│   ├── bot/
│   │   ├── index.ts             ← Grammy bot instance creation
│   │   ├── commands/
│   │   │   ├── start.ts         ← /start — onboarding, wallet connect prompt
│   │   │   ├── connect.ts       ← /connect — wallet address validation + save
│   │   │   ├── swap.ts          ← /swap + /status — main swap flow + tx tracking
│   │   │   ├── price.ts         ← /price <TOKEN> — token price lookup
│   │   │   ├── wallet.ts        ← /wallet — show connected wallet, balance
│   │   │   ├── referral.ts      ← /referral — show referral link + earnings
│   │   │   └── history.ts       ← /history — last 10 swaps
│   │   └── middleware/
│   │       ├── rateLimit.ts     ← Per-user rate limiting
│   │       └── logger.ts        ← Request logging
│   ├── jupiter/
│   │   ├── quote.ts             ← Get swap quotes with platformFeeBps baked in
│   │   ├── swap.ts              ← Build swap transaction with feeAccount
│   │   └── price.ts             ← Token price fetching + fee USD estimation
│   ├── solana/
│   │   ├── connection.ts        ← Solana RPC connection singleton
│   │   ├── phantom.ts           ← Phantom deeplink URL generation
│   │   └── transaction.ts       ← Transaction confirmation polling
│   ├── db/
│   │   ├── client.ts            ← Prisma client singleton
│   │   └── queries/
│   │       ├── users.ts         ← User CRUD operations
│   │       ├── referrals.ts     ← Referral tracking queries
│   │       └── fees.ts          ← Fee earning history queries
│   └── utils/
│       ├── formatting.ts        ← Number/address formatting helpers
│       ├── validation.ts        ← Input sanitization
│       └── constants.ts         ← Token addresses, RPC URLs, etc.
```

---

## Environment Variables

All variables are defined in `.env`. The `src/config.ts` file validates these at startup using Zod — if any required variable is missing, the app crashes with a clear error message rather than failing silently.

```env
# Telegram
TELEGRAM_BOT_TOKEN=                # From @BotFather

# Solana
SOLANA_RPC_URL=                    # Helius or QuickNode RPC endpoint (NOT public mainnet)
FEE_WALLET_ADDRESS=                # YOUR Solana wallet that receives swap fees

# Jupiter
JUPITER_API_URL=https://quote-api.jup.ag/v6   # Jupiter Metis API base URL
PLATFORM_FEE_BPS=50                # 50 = 0.5% fee. Max recommended is 100 (1%)

# App
NODE_ENV=development               # development | production
DATABASE_URL=file:./dev.db         # SQLite path. Change to postgres:// when migrating
LOG_LEVEL=info                     # debug | info | warn | error

# Referral
REFERRAL_FEE_SHARE_PERCENT=25      # % of our earned fee paid to referrers
```

---

## Database Schema (Prisma)

```prisma
model User {
  id              String    @id @default(cuid())
  telegramId      String    @unique
  telegramUsername String?
  walletAddress   String?               // Phantom wallet they connected
  referralCode    String    @unique @default(cuid())  // Their shareable code
  referredById    String?               // Who referred them
  referredBy      User?     @relation("Referrals", fields: [referredById], references: [id])
  referrals       User[]    @relation("Referrals")
  swaps           Swap[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Swap {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  inputMint       String    // Token address being sold
  outputMint      String    // Token address being bought
  inputAmount     BigInt    // In lamports/smallest unit
  outputAmount    BigInt    // Actual output received
  feeAmountUsd    Float?    // Estimated fee in USD (for display)
  txSignature     String?   // Solana transaction signature
  status          SwapStatus @default(PENDING)
  createdAt       DateTime  @default(now())
}

enum SwapStatus {
  PENDING       // Transaction constructed, not yet signed
  SUBMITTED     // User signed and submitted
  CONFIRMED     // Confirmed on-chain
  FAILED        // Failed or expired
}
```

---

## Core Business Logic

### Fee Flow
1. User requests a swap (e.g., SOL → USDC)
2. We call Jupiter `/quote` with `platformFeeBps=50` (0.5%) and `feeAccount=FEE_WALLET_ADDRESS`
3. Jupiter returns a quote that includes our fee baked into the transaction
4. We build the swap transaction using `/swap` endpoint
5. We generate a Phantom deeplink so user can sign on their device
6. User signs → transaction submitted → our fee wallet receives 0.5% automatically on-chain
7. We record the swap in our DB

### Referral Flow
1. User A gets their referral link: `t.me/YourBotName?start=ref_<referralCode>`
2. User B joins via that link → `referredById` is set to User A's ID in DB
3. Every time User B makes a swap, we calculate 25% of the fee and log it as owed to User A
4. User A can check `/referral` to see total earned + pending payout
5. Payouts are initially manual (you send from fee wallet) — automate after scale

### Phantom Deeplink Format
```
https://phantom.app/ul/v1/signAndSendTransaction?
  app_url=https://yourbot.com
  &redirect_link=https://t.me/YourBotName
  &transaction=<base64_serialized_transaction>
```

---

## Commands Reference

| Command | Description | DB Interaction |
|---------|-------------|----------------|
| `/start [ref_CODE]` | Onboard user, show welcome, prompt wallet connect | Create User record |
| `/wallet` | Show connected wallet address + SOL balance | Read User |
| `/connect <ADDRESS>` | Connect a Phantom wallet address | Update User.walletAddress |
| `/swap <AMOUNT> <FROM> <TO>` | Start swap flow | Create Swap record |
| `/status <TX_SIGNATURE>` | Track transaction confirmation after signing | Update Swap status + fee |
| `/price <TOKEN>` | Get token price in USD/SOL | No DB |
| `/referral` | Show referral link + lifetime earnings | Read User + Swaps |
| `/history` | Last 10 swaps | Read Swaps |
| `/help` | Command list | No DB |

---

## Jupiter API Key Details

- **Base URL:** `https://quote-api.jup.ag/v6`
- **Quote endpoint:** `GET /quote`
- **Swap endpoint:** `POST /swap`
- **Fee parameter:** `platformFeeBps` in the quote request (integer, basis points)
- **Fee account:** `feeAccount` in the swap request body (our Solana wallet address)
- **Jupiter's cut:** 2.5% of our fee (so if we charge 50bps, we net 48.75bps)
- **No API key required** for standard usage (rate limits apply at ~600 req/min)
- **For higher limits:** Get a Helius API key and use their Jupiter endpoint

Full API reference in `API.md`.

---

## Development Commands

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start bot in development (hot reload)
npm run dev

# Build TypeScript
npm run build

# Start in production
npm start

# Open Prisma Studio (DB GUI)
npx prisma studio

# Generate Prisma client after schema changes
npx prisma generate
```

---

## Current Build Status

Track what's done vs pending here — update this section as you build:

### ✅ Done
- [x] Project scaffolding (package.json, tsconfig.json, .gitignore, .env.example)
- [x] Prisma schema + migrations (User + Swap models, SQLite)
- [x] Config validation (src/config.ts — Zod validates all env vars at startup)
- [x] Database client singleton (src/db/client.ts)
- [x] Bot skeleton (src/bot/index.ts — Grammy instance with middleware)
- [x] Rate limiting middleware (per-user, per-command limits)
- [x] Logger middleware (request/response logging)
- [x] Entry point (src/app.ts — graceful startup/shutdown)
- [x] Utility files (constants, validation, formatting)
- [x] Solana RPC connection helper (src/solana/connection.ts)

- [x] DB query layer (src/db/queries/ — users, referrals, fees)
- [x] /start command (referral code parsing, user creation, returning user handling)
- [x] /connect command (wallet address validation via PublicKey + save to DB)
- [x] /wallet command (SOL balance lookup via RPC)
- [x] /price command (token price via Jupiter price API)
- [x] /referral command (referral link, count, lifetime earnings)
- [x] /history command (last 10 swaps with status icons)
- [x] Jupiter quote client (src/jupiter/quote.ts — Zod-validated response, platformFeeBps baked in)
- [x] Jupiter swap transaction builder (src/jupiter/swap.ts — builds base64 serialized tx)
- [x] Phantom deeplink generation (src/solana/phantom.ts — signAndSendTransaction URL)
- [x] /swap command (full flow: parse → quote → inline confirm/cancel → build tx → Phantom deeplink)
- [x] Swap callback handlers (swap_confirm + swap_cancel inline keyboard callbacks)
- [x] Transaction confirmation polling (src/solana/transaction.ts — polls getSignatureStatus)
- [x] Fee tracking in DB (Jupiter price API → estimates fee USD on confirmed swaps)
- [x] /status command (submit tx signature → background poll → notify on confirm/fail)
- [x] Token price service (src/jupiter/price.ts — getTokenPriceUsd + estimateFeeUsd)
- [x] Testing guide (TESTING.md — devnet setup, mainnet testing, full checklist)
- [x] Auto-poll transaction confirmation after swap confirm (no manual /status needed)
- [x] Fee USD estimated at quote time (not just confirmation) for accurate tracking
- [x] Duplicate swap prevention (blocks new swap if one is pending <2 min)
- [x] FEE_WALLET_ADDRESS validated as real Solana PublicKey at startup
- [x] Jupiter API retry logic with exponential backoff (429, 503, network errors)
- [x] Tx polling timeout increased to 5 min (handles mainnet congestion)
- [x] DB indexes on Swap table (userId+status, userId+createdAt)
- [x] Audit logging for swap/connect/start/status commands
- [x] PM2 deployment config (ecosystem.config.js)
- [x] Deployment guide (DEPLOY.md)

### 📋 Backlog
- [ ] Token sniping (Phase 2)
- [ ] Copy trading (Phase 3)
- [ ] Web terminal frontend (Phase 3)

---

## Critical Rules — Never Violate These

1. **NEVER store private keys, seed phrases, or signing keys of any user.** Non-custodial means non-custodial.
2. **NEVER commit `.env` to Git.** Only `.env.example` goes to the repo.
3. **NEVER use `any` type in TypeScript.** Use Zod for unknown external data.
4. **NEVER trust user input directly.** Validate all inputs — token addresses, amounts, wallet addresses.
5. **NEVER use public Solana RPC in production.** Always use a dedicated RPC (Helius/QuickNode).
6. **NEVER skip error handling on Jupiter API calls.** They can and do fail — handle gracefully.
7. **ALWAYS validate that a Solana wallet address is valid format before using it.**
8. **ALWAYS rate limit commands** — at minimum 1 request per 2 seconds per user.

---

## When You Are Stuck

- Jupiter API docs: https://dev.jup.ag/docs/swap/get-quote
- Grammy docs: https://grammy.dev
- Prisma docs: https://prisma.io/docs
- Solana web3.js docs: https://solana-labs.github.io/solana-web3.js
- Phantom deeplink spec: https://docs.phantom.app/phantom-deeplinks
