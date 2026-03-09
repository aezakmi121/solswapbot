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
              (Solana swaps)  (cross-chain)   (webhooks + RPC)
                                                    │
                                              Moralis API
                                              (EVM balances)
```

## Components

### 1. Telegram Bot (Grammy)
- **Purpose**: Launcher only
- **Commands**: `/start` (opens Mini App button), `/help` (usage instructions)
- **Catch-all**: Any message → redirects to Mini App
- **Rate limiting**: Per-user per-command
- **Location**: `src/bot/`

### 2. Mini App (Vite + React)
- **Purpose**: ALL user interaction happens here
- **Tabs**: Wallet | Swap | Scan | History | Settings (+ Admin for admin user)
- **Wallet**: Privy MPC embedded wallets (Solana + EVM, auto-created on login)
- **Signing**: `useSignAndSendTransaction` — private key never leaves browser
- **Deployed**: Vercel (`webapp/`)
- **Location**: `webapp/src/`

### 3. Express API Server
- **Purpose**: Backend for Mini App
- **Port**: 3001 (configurable via `API_PORT`)
- **Auth**: Telegram initData HMAC-SHA256 verification on all protected routes
- **CORS**: Locked to Vercel URL (crashes on `*` in production)
- **Rate limiting**: 100 req/min per IP (express-rate-limit)
- **Security**: Helmet headers, input validation (Zod)
- **Location**: `src/api/`

### 4. SQLite Database (Prisma)
- **Models**: User, Swap, Transfer, TokenScan, WatchedWallet, Subscription
- **File**: `prisma/dev.db` (gitignored)
- **Schema**: `prisma/schema.prisma`
- **Why SQLite**: Single-instance PM2, read-heavy workload, <1K users initially

### 5. Background Services
- **Bridge Poller**: `bridgePoller.ts` — polls every 60s for SUBMITTED cross-chain swaps, updates status via LI.FI
- **Swap Poller**: `transaction.ts` — polls on-chain status (100x3s) for each submitted swap
- **Helius Webhook**: Auto-creates webhook on startup, registers wallets on connect, records incoming transfers
- **LI.FI Token Cache**: 30-min TTL cache of cross-chain token lists

## Swap Flow (Same-Chain: SOL → USDC)

```
1. Mini App → GET /api/quote (inputMint, outputMint, humanAmount, slippageBps)
2. API → Jupiter /quote (with platformFeeBps=50)
3. API → Jupiter /price (for USD values)
4. API ← returns quote + USD display breakdown
5. Quote has 30s expiry timer — auto-refreshes
6. User clicks "Swap" → POST /api/swap (quoteResponse, userPublicKey)
7. API validates platformFee.feeBps === config, builds unsigned tx via Jupiter /swap
8. API ← returns base64 unsigned transaction
9. Privy signs + broadcasts in-browser (useSignAndSendTransaction)
10. Frontend calls POST /api/swap/confirm with txSignature
11. Backend polls on-chain (100x3s) → CONFIRMED | FAILED | TIMEOUT
12. Frontend polls GET /api/swap/status every 3s
```

## Cross-Chain Flow (SOL → ETH)

```
1. Mini App → GET /api/cross-chain/quote
2. API → LI.FI /quote with integrator='solswap'
3. User confirms → POST /api/cross-chain/execute (fromAddress, toAddress)
4. API → LI.FI /quote with full addresses → base64 Solana tx
5. Privy signs + broadcasts
6. Frontend calls POST /api/cross-chain/confirm
7. Bridge poller checks LI.FI /status every 60s → updates DB
8. Frontend polls GET /api/cross-chain/status every 5s
```

## Wallet Architecture (Privy MPC)

```
User opens Mini App → Privy auto-creates wallets
        │
        ▼
Privy creates keypair (Solana + EVM)
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

## Revenue Flow

```
Solana swap: Jupiter platformFeeBps=50 → 0.5% auto-deducted to FEE_WALLET_ADDRESS ATA
Cross-chain: LI.FI integrator fees via 'solswap' tag (requires LIFI_API_KEY)
```

## Deployment

### Backend (Hostinger VPS)
```bash
git pull origin main
npm install && npm run build
npx prisma db push   # Only if schema.prisma changed
pm2 restart ecosystem.config.js
```

PM2 config: single instance, 256M max memory, exponential backoff on crashes, logs to `./logs/`.

### Frontend (Vercel)
1. Import repo on Vercel
2. Root Directory: `webapp`
3. Framework: Vite
4. Env vars: `VITE_PRIVY_APP_ID`, `VITE_SOLANA_RPC_URL` (optionally `VITE_API_URL`)

### BotFather Setup
1. `/mybots` → Select bot
2. Bot Settings → Menu Button → Set URL to Vercel URL
