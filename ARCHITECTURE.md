# Architecture

## System Overview

```
User → Telegram Bot (/start) → Mini App (Vercel)
                                    │
                                    ▼
                              Express API (Hostinger VPS :3001)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Jupiter API     LI.FI API       Helius RPC
              (Solana swaps)  (cross-chain)   (webhooks)
```

## Components

### 1. Telegram Bot (Grammy)
- **Purpose**: Launcher only + push notifications
- **Commands**: `/start` (shows "Open SolSwap" button), `/help` (redirects to Mini App)
- **Catch-all**: Any text message → "Use the Mini App" redirect
- **Rate limiting**: Per-user per-command (swap: 3/10s, price: 10/60s, start: 1/30s)
- **Location**: `src/bot/`

### 2. Mini App (Vite + React)
- **Purpose**: ALL user interaction happens here
- **Current state**: Single swap page with Phantom deep-link
- **Target state**: Tabbed UI — Swap | Scan | Track | Signals
- **Wallet**: Privy embedded wallet (NOT YET INTEGRATED — Phase 1)
- **Deployed**: Vercel (`webapp/`)
- **Location**: `webapp/src/`

### 3. Express API Server
- **Purpose**: Backend for Mini App + bot
- **Port**: 3001 (configurable via `API_PORT`)
- **CORS**: Configurable via `CORS_ORIGIN`
- **Error handling**: Global error handler with status codes
- **Location**: `src/api/`

### 4. SQLite Database (Prisma)
- **Purpose**: Users, swaps, scans, watched wallets, subscriptions
- **File**: `prisma/dev.db` (gitignored)
- **Schema**: `prisma/schema.prisma`
- **Why SQLite**: Single-instance PM2, read-heavy workload, <1K users initially

## Swap Flow

### Same-Chain (SOL → USDC) — IMPLEMENTED
```
1. Mini App → GET /api/quote (inputMint, outputMint, amount)
2. API → Jupiter quote API (with platformFeeBps=50)
3. API → Jupiter price API (for USD values)
4. API ← returns quote + inputUsd + outputUsd + feeUsd
5. User confirms → POST /api/swap (quoteResponse, userPublicKey)
6. API → Jupiter swap API (with feeAccount)
7. API ← returns unsigned base64 transaction
8. Mini App sends TX to wallet for signing
   └── Currently: Phantom deep-link (placeholder)
   └── Target: Privy in-app signing (Phase 1)
9. TX broadcast to Solana → polled for confirmation
```

### Cross-Chain (SOL → ETH) — IMPLEMENTED (quote only)
```
1. Mini App → GET /api/cross-chain/quote
2. API → Smart Router checks if same-chain or cross-chain
3. If cross-chain → LI.FI API for route + quote
4. API ← returns route, amounts, estimated time
5. TX building + signing → NOT YET (needs Privy + LI.FI TX builder)
```

## Wallet Architecture (Privy MPC) — NOT YET INTEGRATED

```
User opens Mini App
        │
        ▼
Privy creates wallet keypair (automatic)
        │
        ▼
Key is split via MPC (Multi-Party Computation)
        │
   ┌────┴────┐
   ▼         ▼
 Privy    User's
 Shard    Shard
```

- Neither party alone can sign transactions
- Both shards required to reconstruct signing key
- Signing happens client-side in the Mini App
- Developer (us) never sees the full private key
- User gets both Solana AND EVM wallet from one login

## Deployment

### Backend (Hostinger VPS)
```bash
git pull origin main
npm install && npm run build
npx prisma db push
pm2 restart ecosystem.config.js
```

PM2 config: single instance, 256M max memory, exponential backoff on crashes, logs to `./logs/`.

### Frontend (Vercel)
1. Import repo on Vercel
2. Root Directory: `webapp`
3. Framework: Vite
4. Env vars: `VITE_API_URL`, `VITE_PRIVY_APP_ID`

### BotFather Setup
1. `/mybots` → Select bot
2. Bot Settings → Menu Button → Set URL to Vercel URL
