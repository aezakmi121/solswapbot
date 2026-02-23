# ARCHITECTURE.md — System Design

## Overview

SolSwap Bot is a **non-custodial** Telegram trading bot. The critical architectural decision is that we never hold user funds. Users retain full custody of their assets at all times. We are an interface layer — we construct transactions and earn a fee when users choose to execute them.

---

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        USER                                  │
│                  (Telegram + Phantom)                        │
└──────────────┬──────────────────────┬───────────────────────┘
               │ Telegram messages    │ Signs transactions
               ▼                      ▼
┌─────────────────────┐    ┌─────────────────────┐
│   TELEGRAM BOT      │    │   PHANTOM WALLET     │
│   (Grammy/Node.js)  │    │   (User's device)    │
│                     │    │                      │
│  - Handle commands  │    │  - Signs tx locally  │
│  - Manage state     │    │  - Submits to chain  │
│  - Generate links   │    │                      │
└──────────┬──────────┘    └─────────────────────┘
           │
           ├──── Reads/writes user data
           │
           ▼
┌─────────────────────┐
│   SQLite DATABASE   │
│   (Prisma ORM)      │
│                     │
│  - Users            │
│  - Swap history     │
│  - Referral tree    │
└─────────────────────┘
           │
           ├──── Gets quotes + builds transactions
           │
           ▼
┌─────────────────────┐         ┌─────────────────────┐
│   JUPITER API       │────────▶│   SOLANA MAINNET     │
│   (Metis v6)        │         │   (via Helius RPC)   │
│                     │         │                      │
│  - Best route       │         │  - Transaction       │
│  - Fee baked in     │         │    confirmation      │
│  - Tx construction  │         │  - Fee delivery to   │
└─────────────────────┘         │    our wallet        │
                                └─────────────────────┘
```

---

## Data Flow: Complete Swap

```
User types: /swap 1 SOL USDC
                │
                ▼
        Bot validates input
        (amount > 0, valid tokens)
                │
                ▼
        Look up token mint addresses
        SOL = So11111111111111111111111111111111111111112
        USDC = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
                │
                ▼
        GET /quote from Jupiter API
        ?inputMint=SOL_MINT
        &outputMint=USDC_MINT
        &amount=1000000000 (1 SOL in lamports)
        &platformFeeBps=50 (our 0.5% fee)
        &slippageBps=50 (0.5% slippage tolerance)
                │
                ▼
        Jupiter returns quote:
        {
          outAmount: "23450000" (23.45 USDC),
          priceImpactPct: "0.01",
          routePlan: [...],
          otherAmountThreshold: "23333000"
        }
                │
                ▼
        Bot displays quote to user:
        "Swap 1 SOL → ~23.45 USDC
         Fee: 0.5% (~$0.12)
         Slippage: 0.5%
         [Confirm Swap ✅] [Cancel ❌]"
                │
           User taps ✅
                │
                ▼
        POST /swap to Jupiter
        Body: { quoteResponse, userPublicKey, feeAccount: FEE_WALLET }
                │
                ▼
        Jupiter returns serialized transaction (base64)
                │
                ▼
        Bot creates Phantom deeplink:
        phantom.app/ul/v1/signAndSendTransaction?
          transaction=<base64_tx>
          &redirect_link=t.me/YourBot
                │
                ▼
        Bot sends deeplink button to user
        "Tap to sign in Phantom"
                │
           User taps → Phantom opens
           User reviews → User signs
           Phantom submits → Solana confirms
                │
                ▼
        User sends: /status <TX_SIGNATURE>
                │
                ▼
        Bot starts background polling:
        (src/solana/transaction.ts)
        Loop every 3s for up to ~2 min:
          → getSignatureStatus(txSignature)
          → If confirmed → update DB status to CONFIRMED
          → If failed → update DB status to FAILED
                │
                ▼
        On confirmation:
        → Fetch output token price (src/jupiter/price.ts)
        → Calculate fee USD value
        → Update swap.feeAmountUsd in DB
        → Notify user: "Transaction confirmed! Fee earned: $0.12"
                │
                ▼
        On-chain result:
        - User receives ~23.45 USDC
        - Our FEE_WALLET receives 0.5% fee automatically
        - Transaction + fee USD recorded in our DB
```

---

## Data Flow: Referral System

```
User A has referral code: "abc123"
Shareable link: t.me/YourBot?start=ref_abc123

User B clicks link → Opens Telegram bot
        │
        ▼
/start ref_abc123 command received
        │
        ▼
Bot checks: is "abc123" a valid referral code?
        │ Yes
        ▼
Create User B record with referredById = User A's ID
        │
        ▼
User B makes swaps over time:
Swap 1: 0.5% fee = $0.50 → 25% ($0.125) tracked as owed to User A
Swap 2: 0.5% fee = $2.00 → 25% ($0.50) tracked as owed to User A
Swap N: ...
        │
        ▼
User A types /referral:
"Your referral link: t.me/YourBot?start=ref_abc123
 Total referrals: 3 users
 Total earned: $4.82 (pending payout)
 [Request Payout]"
        │
   User requests payout
        │
        ▼
You manually send SOL/USDC from fee wallet to User A
(Automate this in Phase 2 with on-chain payout contract)
```

---

## Database Schema Explained

### Why these tables?

**User table** — one record per Telegram user. Links their Telegram identity to their Phantom wallet. Also stores their referral code (for sharing) and who referred them (for tracking).

**Swap table** — one record per swap attempt. Tracks the full lifecycle: PENDING (constructed) → SUBMITTED (signed by user) → CONFIRMED (on-chain) / FAILED. We can't know if a user actually signs — we record PENDING when we generate the link, and confirm by polling the transaction signature.

### Migration path to PostgreSQL

When you're ready to scale:

1. Provision a PostgreSQL instance (Railway ~$5/month, Supabase free tier, or Neon free tier)
2. In `prisma/schema.prisma`, change:
   ```
   datasource db {
     provider = "sqlite"    // Change this to "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Update `DATABASE_URL` in `.env` to your PostgreSQL connection string
4. Run: `npx prisma migrate deploy`
5. Done. Zero application code changes.

**When to migrate:** When you exceed ~200 concurrent users actively swapping OR when you need to run a second bot instance (horizontal scaling). SQLite handles one process at a time cleanly.

---

## Non-Custodial Security Model

```
What we OWN:
├── Our bot server (VPS)
├── Our Telegram bot token
├── Our fee wallet (receives fees)
└── Our database (user Telegram IDs, wallet addresses, swap history)

What we DON'T OWN / NEVER TOUCH:
├── User private keys    ← Never generated by us, never seen by us
├── User seed phrases    ← Never requested, never stored
└── User funds           ← Only leave user wallet when user signs
```

The key insight: **wallet addresses are public information**. We store them the same way a block explorer does. Knowing someone's wallet address gives you zero ability to move their funds. Only the private key can do that — and that never leaves Phantom on the user's device.

---

## Rate Limiting Strategy

Per-user limits enforced in Grammy middleware:

| Command | Limit | Window |
|---------|-------|--------|
| `/swap` | 3 requests | 10 seconds |
| `/price` | 10 requests | 60 seconds |
| `/start` | 1 request | 30 seconds |
| All others | 5 requests | 30 seconds |

Why: Prevents abuse, protects Jupiter API rate limits, prevents accidental duplicate swaps.

---

## Deployment Architecture

```
Your VPS (Ubuntu 22.04)
├── Node.js 20 (runtime)
├── PM2 (process manager — auto-restart on crash)
├── Bot process (index.js)
└── SQLite file (./data/prod.db)
    └── Backed up daily via cron → encrypted archive
```

**Single VPS is sufficient until ~10,000 DAU.** After that, move DB to managed PostgreSQL and can horizontally scale bot instances behind a load balancer.

---

## Phase Roadmap

### Phase 1 — MVP (Weeks 1–2) ✅ COMPLETE
Core swap functionality. Everything needed to go live and earn fees.
- Bot scaffolding with Grammy ✅
- Jupiter quote + swap integration ✅ (`src/jupiter/quote.ts`, `src/jupiter/swap.ts`)
- Phantom deeplink generation ✅ (`src/solana/phantom.ts`)
- `/start`, `/connect`, `/wallet`, `/swap`, `/price`, `/referral`, `/history` commands ✅
- Swap inline keyboard confirmation flow (confirm/cancel callbacks) ✅
- Prisma DB with User + Swap models ✅
- Rate limiting ✅
- Deploy to VPS with PM2

### Phase 2 — Growth (Month 2)
Features that increase volume and user acquisition.
- Token sniping (Pump.fun + Raydium new pair detection via WebSocket)
- Copy trading (mirror a wallet address's trades)
- Improved referral UI + leaderboard
- Premium tier (lower fees for $29/month)

### Phase 3 — Scale (Month 3–6)
Platform features once you have revenue.
- Web terminal (BullX-style hybrid — React frontend)
- Signal marketplace integration
- Automated referral payouts (on-chain)
- Multi-wallet support per user
- Portfolio tracking (/portfolio)

### Phase 4 — Protocol (Month 6+)
If revenue justifies it.
- Native token launch (fee discounts, revenue sharing, governance)
- White-label bot licensing
- PostgreSQL migration
- Multi-region deployment
