# CLAUDE.md — Project Context

> Single source of truth. Read fully before editing any code.

## Project Overview

**SolSwap Bot** — Non-custodial Telegram trading bot for Solana tokens.
Users swap tokens via an embedded **Telegram Mini App** powered by Jupiter API.
Revenue: 0.5% platform fee on every swap.

### Architecture

```
Telegram
  ├── Grammy Bot (text commands)
  │   └── /start /help /price /referral /history /trade /swap /status
  ├── Mini App (webapp/) → Vercel
  │   └── React + Solana Wallet Adapter → sign & send
  └── Express API (src/api/) → VPS port 3001
      └── /api/quote /api/swap /api/price /api/tokens
            └── Jupiter API (lite-api.jup.ag/swap/v1)
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| Bot | Grammy | Latest |
| Mini App | Vite + React | Latest |
| Wallet | @solana/wallet-adapter | Latest |
| API Server | Express.js | 4.x |
| Jupiter | lite-api.jup.ag/swap/v1 | Free tier |
| Solana | @solana/web3.js | Latest |
| ORM | Prisma | Latest |
| Database | SQLite | — |
| Validation | Zod | Latest |
| Deployment | VPS (bot+API) + Vercel (webapp) | — |

## File Structure

```
solswap-bot/
├── CLAUDE.md                    ← You are here
├── README.md / API.md / ARCHITECTURE.md / SECURITY.md / TESTING.md / DEPLOY.md
├── .env.example
├── package.json
├── tsconfig.json
├── ecosystem.config.js          ← PM2 config
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app.ts                   ← Entry — starts bot + API server
│   ├── config.ts                ← Zod-validated env vars
│   ├── api/
│   │   ├── server.ts            ← Express server (port 3001)
│   │   └── routes/
│   │       ├── quote.ts         ← GET /api/quote
│   │       ├── swap.ts          ← POST /api/swap
│   │       ├── price.ts         ← GET /api/price/:mint
│   │       └── tokens.ts        ← GET /api/tokens
│   ├── bot/
│   │   ├── index.ts             ← Grammy bot + /trade Mini App button
│   │   ├── commands/
│   │   │   ├── start.ts / connect.ts / wallet.ts / price.ts
│   │   │   ├── swap.ts          ← /swap command (redirects to Mini App)
│   │   │   ├── referral.ts / history.ts
│   │   └── middleware/
│   │       ├── rateLimit.ts / logger.ts
│   ├── jupiter/
│   │   ├── quote.ts / swap.ts / price.ts
│   ├── solana/
│   │   ├── connection.ts / transaction.ts
│   ├── db/
│   │   ├── client.ts
│   │   └── queries/ (users.ts, referrals.ts, fees.ts)
│   └── utils/ (formatting.ts, validation.ts, constants.ts)
└── webapp/                      ← Mini App (Vite + React)
    ├── package.json
    ├── index.html               ← Telegram WebApp SDK loaded here
    ├── vite.config.ts
    └── src/
        ├── main.tsx             ← Providers (Wallet, Connection)
        ├── App.tsx              ← Swap UI (all-in-one)
        ├── lib/api.ts           ← API client
        └── styles/index.css     ← Dark theme
```

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=          # From @BotFather
SOLANA_RPC_URL=              # Helius RPC
FEE_WALLET_ADDRESS=          # Your Solana wallet for fees
JUPITER_API_URL=https://lite-api.jup.ag/swap/v1
PLATFORM_FEE_BPS=50          # 0.5%
NODE_ENV=development
DATABASE_URL=file:./dev.db
API_PORT=3001
CORS_ORIGIN=*                # Set to Vercel URL in production
MINIAPP_URL=                 # Your Vercel deployment URL
REFERRAL_FEE_SHARE_PERCENT=25
```

## Core Flow

1. User opens `/trade` → Mini App loads in Telegram
2. User connects Phantom wallet via wallet-adapter
3. User selects tokens + amount → API fetches Jupiter quote
4. User sees breakdown (USD values, exchange rate, fee, price impact)
5. User clicks "Swap Now" → wallet-adapter signs the tx
6. Transaction submitted to Solana → fee delivered to our wallet on-chain
7. Bot records swap in DB

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Onboard user, show welcome |
| `/trade` | Open Mini App trading panel |
| `/swap <AMOUNT> <FROM> <TO>` | Quick swap via chat |
| `/price <TOKEN>` | Token price |
| `/wallet` | Show balance |
| `/connect <ADDRESS>` | Connect wallet |
| `/referral` | Referral link + earnings |
| `/history` | Last 10 swaps |
| `/status <TX>` | Track transaction |
| `/help` | Command list |

## Development

```bash
npm install && npx prisma migrate dev && npm run dev
cd webapp && npm install && npm run dev
```

## Critical Rules

1. **NEVER store private keys.** Non-custodial.
2. **NEVER commit `.env`.**
3. **NEVER use `any` type.** Use Zod for unknown data.
4. **ALWAYS validate inputs.**
5. **ALWAYS rate limit commands.**

## Current Status

### ✅ Done
- All bot commands (start, connect, wallet, price, swap, status, referral, history)
- Jupiter API v1 integration (quote, swap, price)
- Express API server for Mini App
- Telegram Mini App (Vite + React + wallet-adapter)
- Premium dark theme UI
- Balance warning with gas estimate
- Referral system (25% fee share)
- PM2 deployment

### 📋 Backlog
- Pump.fun new token sniper
- Copy trading
- Token alerts
- Portfolio tracking in Mini App
