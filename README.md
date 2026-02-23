# SolSwap Bot

A non-custodial Telegram trading bot for Solana tokens, powered by Jupiter API. Users swap tokens directly in Telegram using their own Phantom wallet — we earn a 0.5% platform fee on every trade, automatically, on-chain.

## Why Non-Custodial?

We never hold user private keys or funds. Users retain full custody at all times. This eliminates the #1 security risk that has plagued custodial trading bots (Banana Gun $980K exploit, Maestro exploit, Unibot exploit). Our security surface is fundamentally smaller.

## Features

- **Instant swaps** — Any Solana token pair via Jupiter's best-route aggregation
- **No custody risk** — Users sign with their own Phantom wallet
- **Referral system** — 25% of earned fees paid to referrers, forever
- **Token prices** — Real-time price lookups
- **Swap history** — Track past trades

## Tech Stack

- **Node.js 20 + TypeScript**
- **Grammy** (Telegram bot framework)
- **Jupiter Metis API v6** (swap routing + fee collection)
- **Prisma + SQLite** (database — upgrades to PostgreSQL at scale)
- **Solana web3.js** (transaction handling)

## Documentation

| File | Contents |
|------|----------|
| `CLAUDE.md` | Master context file for Claude Code — start here |
| `ARCHITECTURE.md` | System design, data flows, phase roadmap |
| `SECURITY.md` | Threat model, security rules, incident response |
| `API.md` | Jupiter API reference and integration notes |

## Quick Start

```bash
# 1. Clone repo and install
git clone <your-repo>
cd solana-swap-bot
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your values

# 3. Set up database
npx prisma migrate dev

# 4. Start in development
npm run dev
```

## Environment Variables

See `.env.example` for all required variables. Minimum to run:
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `SOLANA_RPC_URL` — Helius recommended
- `FEE_WALLET_ADDRESS` — your wallet that receives fees

## Revenue Model

Every swap through the bot generates a 0.5% fee, collected automatically on-chain by Jupiter's fee mechanism. No invoicing, no manual collection — it accumulates in our wallet with every transaction.

At 500 swaps/day averaging $200 each = $500/day in fee revenue.

## License

MIT
