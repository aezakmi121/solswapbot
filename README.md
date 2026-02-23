# SolSwap Bot

**Non-custodial Solana trading bot for Telegram** — swap tokens instantly via Jupiter, with the lowest fees in the market (0.5%).

## What It Does

Users swap Solana tokens directly inside Telegram through an embedded **Mini App**. Connect your Phantom wallet, pick tokens, see a live quote with full fee breakdown, and sign the transaction — all without leaving Telegram.

Your funds stay in YOUR wallet. We never hold your keys.

## Revenue Model

| You Earn | Jupiter Keeps | User Pays |
|----------|-------------|-----------|
| ~0.4875% | 2.5% of our fee | 0.5% per swap |

At $100K monthly volume → ~$490/month passive income, scaling with usage.

## Architecture

```
Telegram Chat
  ├── /start, /help, /price, /referral, /history (text commands)
  └── /trade → Opens Mini App (embedded web UI)
        ├── React + Vite (Vercel, free hosting)
        ├── Solana Wallet Adapter (Phantom, Solflare)
        └── Calls Express API → Jupiter → Solana
```

## Quick Start

```bash
# Backend (bot + API)
npm install
cp .env.example .env      # Fill in your tokens
npx prisma migrate dev
npm run dev

# Frontend (Mini App)
cd webapp
npm install
npm run dev
```

## Deployment

- **Backend**: Hostinger VPS ($5/mo) via PM2
- **Frontend**: Vercel (free) — connect GitHub repo, set root to `webapp/`
- **Configure BotFather**: Set Mini App URL via `/mybots → Bot Settings → Menu Button`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Bot | Grammy (Telegram) |
| Mini App | Vite + React + TypeScript |
| API | Express.js |
| Blockchain | Solana Web3.js + Jupiter API |
| Wallet | Solana Wallet Adapter (Phantom) |
| Database | SQLite (Prisma ORM) |
| Hosting | VPS + Vercel |

## Docs

- `CLAUDE.md` — Full project context
- `ARCHITECTURE.md` — System design
- `SECURITY.md` — Threat model
- `API.md` — Jupiter + REST API reference
- `TESTING.md` — Testing guide
- `DEPLOY.md` — Production deployment
