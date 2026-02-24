# SolSwap — AI Context File

> This file provides complete context for any AI assistant working on the SolSwap codebase.
> Read this file FIRST before making any changes.

## What Is SolSwap?

SolSwap is a **Telegram Mini App** that lets users swap tokens across multiple blockchains (Solana, Ethereum, BNB Chain, etc.) — entirely inside Telegram. No external wallets, no deep links, no redirects.

It also provides **token safety scanning**, **whale tracking**, and **AI market signals** — all accessible from a single Mini App interface.

## Architecture

```
┌─────────────────────────────────────────┐
│ Telegram                                │
│  ┌──────────┐    ┌────────────────────┐│
│  │ Grammy   │    │ Mini App (Vite)    ││
│  │ Bot      │    │ React + Privy SDK  ││
│  │ /start   │    │ Swap | Scan | Track││
│  └────┬─────┘    └────────┬───────────┘│
└───────┼───────────────────┼─────────────┘
        │                   │
        ▼                   ▼
┌─────────────────────────────────────────┐
│ Express API Server (:3001)              │
│ Routes: /api/quote, /api/swap,          │
│   /api/scan, /api/price, /api/user,     │
│   /api/history, /api/webhooks           │
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

## Key Design Decisions

### 1. Mini App-First, Not Bot-First
The Telegram bot is **only a launcher**. The only command a user needs is `/start`, which shows a button to open the Mini App. ALL features (swap, scan, track, signals, settings, history) live inside the Mini App UI.

### 2. Privy Embedded Wallets (Non-Custodial)
Users get wallets created automatically via Privy's MPC infrastructure when they open the Mini App. This means:
- **No Phantom redirects** — signing happens inside the Mini App
- **Non-custodial** — private keys are split via MPC, no single party holds the full key
- **Multi-chain** — user gets both a Solana wallet AND an EVM wallet from one login
- **We never hold keys** — Privy's infrastructure handles key management

### 3. Revenue Through API Fees (Zero Custodial Liability)
- **Solana swaps**: Jupiter `platformFeeBps` parameter (currently 50 bps = 0.5%)
- **Cross-chain swaps**: Rango affiliate fee share
- **Subscriptions**: Scanner Pro, Whale Tracker, AI Signals via Telegram Stars
- **Exchange affiliates**: Binance/Bybit/OKX referral links (up to 50% lifetime commission)

### 4. SQLite Is Enough
The app is read-heavy with light writes. At 1K users → ~4 MB/month. SQLite via Prisma. Migration to PostgreSQL is a one-line Prisma change if needed later.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Bot Framework | Grammy (TypeScript) |
| API Server | Express.js |
| Database | SQLite via Prisma ORM |
| Mini App Frontend | Vite + React + TypeScript |
| Wallet Infrastructure | Privy (MPC embedded wallets) |
| Solana DEX | Jupiter API (swap + quote + price) |
| Cross-Chain | LI.FI API (routing + bridging, no key required) |
| Blockchain RPC | Helius (Solana) |
| AI | Google Gemini API |
| Validation | Zod schemas |
| Deployment | VPS (Hostinger) + Vercel (webapp) |

## Project Structure

```
solswapbot/
├── src/
│   ├── app.ts              # Entry point — starts bot + API server
│   ├── config.ts           # Zod-validated env config
│   ├── api/
│   │   ├── server.ts       # Express server setup
│   │   └── routes/         # API route handlers
│   │       ├── quote.ts    # GET /api/quote
│   │       ├── swap.ts     # POST /api/swap
│   │       ├── price.ts    # GET /api/price/:mint
│   │       ├── scan.ts     # GET /api/scan?mint=
│   │       ├── crossChain.ts # GET /api/cross-chain/quote|chains|tokens
│   │       └── webhooks.ts # POST /api/webhooks/helius [NEW]
│   ├── bot/
│   │   ├── index.ts        # Bot setup — only /start + /help, all point to Mini App
│   │   ├── commands/
│   │   │   └── start.ts    # /start — creates user + shows Mini App button
│   │   └── middleware/
│   │       ├── logger.ts
│   │       └── rateLimit.ts
│   ├── scanner/
│   │   ├── analyze.ts      # Main analysis orchestrator (risk score 0-100)
│   │   └── checks.ts       # Safety checks (mint auth, freeze, holders, age)
│   ├── aggregator/
│   │   ├── router.ts       # Smart router: Jupiter (same-chain) vs Rango (cross-chain)
│   │   ├── lifi.ts         # LI.FI API client (no key required for basic use)
│   │   └── chains.ts       # Chain + token registry (6 chains, 15 tokens)
│   ├── tracker/            # [NEW] Whale wallet tracking
│   │   ├── webhooks.ts     # Helius webhook handler
│   │   └── alerts.ts       # Format + send TG alerts
│   ├── signals/            # [NEW] AI market signals
│   │   ├── analyzer.ts     # AI analysis via Gemini
│   │   └── scheduler.ts    # Cron delivery
│   ├── jupiter/
│   │   ├── quote.ts        # Jupiter quote with platformFeeBps
│   │   ├── swap.ts         # Jupiter swap transaction builder
│   │   └── price.ts        # Jupiter price feed
│   ├── solana/
│   │   ├── connection.ts   # Solana RPC singleton
│   │   └── transaction.ts  # TX polling + confirmation
│   ├── db/
│   │   ├── client.ts       # Prisma client singleton
│   │   └── queries/
│   │       ├── users.ts
│   │       ├── fees.ts
│   │       └── referrals.ts
│   └── utils/
│       ├── constants.ts    # Token mints, decimals
│       ├── formatting.ts   # Address shortening, USD formatting
│       ├── validation.ts   # Input sanitization, address validation
│       └── retry.ts        # HTTP retry logic
├── webapp/                 # Telegram Mini App (deployed to Vercel)
│   ├── src/
│   │   ├── App.tsx         # Main app — tabbed interface
│   │   ├── main.tsx        # Entry point with Privy provider
│   │   ├── components/     # [NEW] UI components
│   │   │   ├── SwapPanel.tsx
│   │   │   ├── ScanPanel.tsx
│   │   │   ├── TrackPanel.tsx
│   │   │   ├── SignalsPanel.tsx
│   │   │   ├── WalletHeader.tsx
│   │   │   └── TokenSelector.tsx
│   │   ├── lib/
│   │   │   └── api.ts      # API client
│   │   └── styles/
│   │       └── index.css   # Premium dark theme
│   ├── index.html
│   ├── vite.config.ts
│   └── vercel.json
├── prisma/
│   └── schema.prisma       # User, Swap, TokenScan, WatchedWallet, Subscription
├── package.json
├── tsconfig.json
├── ecosystem.config.js     # PM2 config for VPS
├── CONTEXT.md              # ← This file (AI context)
├── README.md               # User-facing project overview
├── ARCHITECTURE.md          # Technical architecture details
├── SECURITY.md              # Security model (Privy MPC)
├── API.md                   # API endpoint documentation
└── .env.example             # Required environment variables
```

## Database Schema

### Existing Models (keep)
- **User**: telegramId, walletAddress, referralCode, referredBy
- **Swap**: inputMint, outputMint, amounts, txSignature, status (PENDING/SUBMITTED/CONFIRMED/FAILED)

### New Models (add)
- **TokenScan**: mintAddress, riskScore (0-100), flags (JSON), userId
- **WatchedWallet**: walletAddress, userId, label, active
- **Subscription**: userId, tier (FREE/SCANNER_PRO/WHALE_TRACKER/SIGNALS/ALL_ACCESS), expiresAt

## Revenue Flow

```
User swaps SOL → USDC via Mini App
  └→ Jupiter API receives platformFeeBps=50
     └→ 0.5% fee auto-collected into FEE_WALLET_ADDRESS
        └→ On-chain, trustless — we just pass the param

User swaps SOL → ETH (cross-chain)
  └→ LI.FI API routes through best bridge
     └→ Integrator fee collected via LI.FI partner portal

User subscribes to Whale Tracker
  └→ Telegram Stars payment → converts to revenue

User clicks "Buy on Binance" link
  └→ Affiliate commission (up to 50% lifetime)
```

## Environment Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=         # From @BotFather

# Solana
SOLANA_RPC_URL=             # Helius RPC endpoint
FEE_WALLET_ADDRESS=         # Your Solana address for fee collection

# Jupiter
JUPITER_API_URL=            # https://lite-api.jup.ag/swap/v1
PLATFORM_FEE_BPS=50         # 0.5% platform fee

# Privy (embedded wallets)
NEXT_PUBLIC_PRIVY_APP_ID=   # From Privy dashboard

# LI.FI (Cross-Chain) — optional, works without key!
# LIFI_API_KEY=             # From LI.FI partner portal (optional)

# Helius (webhooks + RPC)
HELIUS_API_KEY=             # From Helius dashboard

# AI Signals
GEMINI_API_KEY=             # From Google AI Studio

# App
API_PORT=3001
CORS_ORIGIN=*
MINIAPP_URL=                # Vercel deployment URL
DATABASE_URL=file:./dev.db
NODE_ENV=development
```

## Important Conventions

1. **All external API data is validated with Zod** — see `src/jupiter/quote.ts` for pattern
2. **Config is type-safe** — `src/config.ts` uses Zod to validate all env vars at startup
3. **User input is sanitized** — `src/utils/validation.ts` used in all command handlers
4. **HTTP calls use retry logic** — `src/utils/retry.ts` wraps all Jupiter/Rango calls
5. **Prisma queries are in `src/db/queries/`** — one file per domain (users, fees, referrals)
6. **The bot has exactly ONE user-facing command: `/start`** — everything else is in the Mini App

## What NOT To Do

- **Do NOT add more bot commands** — all features go in the Mini App
- **Do NOT generate or store private keys** — Privy handles all key management
- **Do NOT build custodial wallet features** — we are non-custodial
- **Do NOT redirect to external wallets** — Privy signs inside the Mini App
- **Do NOT use PostgreSQL** — SQLite is sufficient for this scale
