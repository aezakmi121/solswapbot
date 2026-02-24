# Architecture

## System Overview

```
User → Telegram Bot (/start) → Mini App (Vercel)
                                    │
                                    ▼
                              Express API (VPS :3001)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Jupiter API     Rango API       Helius RPC
              (Solana swaps)  (cross-chain)   (webhooks)
```

## Components

### 1. Telegram Bot (Grammy)
- **Purpose**: Launcher only + push notifications
- **Commands**: `/start` (shows "Open SolSwap" button)
- **Notifications**: Whale alerts, swap confirmations, daily signals
- **Location**: `src/bot/`

### 2. Mini App (Vite + React)
- **Purpose**: ALL user interaction happens here
- **Tabs**: Swap | Scan | Track | Signals
- **Wallet**: Privy embedded wallet (auto-created on first open)
- **Deployed**: Vercel (`webapp/`)
- **Location**: `webapp/src/`

### 3. Express API Server
- **Purpose**: Backend for Mini App + bot
- **Port**: 3001 (configurable)
- **Routes**: See `API.md`
- **Location**: `src/api/`

### 4. SQLite Database (Prisma)
- **Purpose**: Users, swaps, scans, subscriptions
- **File**: `prisma/dev.db`
- **Schema**: `prisma/schema.prisma`

## Swap Flow (Non-Custodial)

### Same-Chain (SOL → USDC)
```
Mini App → API /api/quote → Jupiter API
Mini App ← quote with platformFee
User confirms → API /api/swap → Jupiter builds TX
Mini App ← unsigned TX
Privy signs TX inside Mini App → broadcasts to Solana
API polls for confirmation → updates DB
```

### Cross-Chain (SOL → ETH)
```
Mini App → API /api/quote?crossChain=true → Rango API
Mini App ← route (SOL→USDC→bridge→ETH) with affiliate fee
User confirms → Rango builds TX
Privy signs Solana TX → bridge handles cross-chain delivery
ETH arrives in user's Privy EVM wallet
```

## Wallet Architecture (Privy MPC)

```
User authenticates via Telegram
        │
        ▼
Privy creates wallet keypair
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

## Deployment

### Backend (Hostinger VPS)
```bash
git pull origin main
npm install && npm run build
npx prisma db push
pm2 restart ecosystem.config.js
```

### Frontend (Vercel)
1. Import repo on Vercel
2. Root Directory: `webapp`
3. Framework: Vite
4. Env vars: `VITE_API_URL`, `VITE_PRIVY_APP_ID`

### BotFather Setup
1. `/mybots` → Select bot
2. Bot Settings → Menu Button → Set URL to Vercel URL
