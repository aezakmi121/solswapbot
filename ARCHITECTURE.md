# ARCHITECTURE.md — System Design

## Overview

SolSwap Bot is a **non-custodial** Telegram trading bot. Users swap tokens via an embedded **Telegram Mini App** (TWA) that connects to their own wallet. We construct transactions with our 0.5% fee baked in via Jupiter.

## System Diagram

```
┌───────────────────────────────────────────────────┐
│                   TELEGRAM                         │
│                                                    │
│  Bot Commands: /start /help /price /referral       │
│                                                    │
│  /trade → Opens Mini App ─────────────────┐       │
│  ┌────────────────────────────────────────┐│       │
│  │  MINI APP (Vite + React)              ││       │
│  │  Hosted on Vercel (free)              ││       │
│  │                                        ││       │
│  │  • Wallet connect (Phantom/Solflare)  ││       │
│  │  • Token selector + amount input      ││       │
│  │  • Live quote + fee breakdown         ││       │
│  │  • Sign & send transaction            ││       │
│  └────────────────┬───────────────────────┘│       │
└────────────────────┼──────────────────────────────┘
                     │ API calls (HTTPS)
                     ▼
┌────────────────────────────────────┐
│  EXPRESS API (VPS, port 3001)      │
│  Runs alongside Grammy bot         │
│                                    │
│  GET  /api/quote    → Jupiter      │
│  POST /api/swap     → Jupiter      │
│  GET  /api/price    → Jupiter      │
│  GET  /api/tokens   → Static list  │
└──────────┬─────────────────────────┘
           │
    ┌──────┴──────┐
    │ Jupiter API │ → Solana Mainnet
    │ (v1 free)   │   (via Helius RPC)
    └─────────────┘
```

## Data Flow: Swap

```
User taps /trade
  → Mini App opens in Telegram
  → User connects wallet (Phantom adapter)
  → User selects: 1 SOL → USDC
  → Frontend calls GET /api/quote
  → API calls Jupiter /quote with platformFeeBps=50
  → User sees breakdown: 148.32 USDC, fee $0.74, rate, impact
  → User clicks "Swap Now"
  → Frontend calls POST /api/swap
  → API calls Jupiter /swap → returns base64 tx
  → Frontend deserializes tx → wallet-adapter signs it
  → Signed tx sent to Solana via RPC
  → Fee delivered to our wallet on-chain automatically
  → Swap recorded in DB
```

## Key Design Decisions

1. **Non-custodial**: We never hold keys. Wallet-adapter signs client-side.
2. **Mini App over deeplinks**: Phantom deeplinks were breaking. Mini App works on mobile + desktop.
3. **Vercel for frontend**: Free, HTTPS included, auto-deploy on push.
4. **Express API on VPS**: Lightweight, runs alongside Grammy bot.
5. **0.5% fee**: Half the industry standard (1%). Our competitive edge.
