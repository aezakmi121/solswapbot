# SolSwap — Telegram Trading Suite

A non-custodial, cross-chain token trading app built as a **Telegram Mini App**. Swap tokens across Solana, Ethereum, and more — without ever leaving Telegram.

## Features

| Feature | Status |
|---------|--------|
| Cross-Chain Swaps — SOL, ETH, BNB, MATIC, ARB, BASE via Jupiter + LI.FI | Backend done, UI in progress |
| Token Scanner — Paste any contract, get instant safety score | Backend done, UI in progress |
| Whale Tracker — Follow smart money wallets, get alerts | Schema done, not built |
| AI Signals — Daily market analysis powered by Gemini | Planned |
| Zero Custody — Privy MPC wallets sign inside the Mini App | Integration pending |

## How It Works

1. User opens the bot in Telegram → taps **"Open SolSwap"**
2. Mini App creates an embedded wallet via Privy (automatic, one tap)
3. User deposits SOL/ETH and starts trading — everything happens in-app
4. Revenue earned via platform fees (0.5% per swap, on-chain via Jupiter)

## Tech Stack

| Layer | Tech |
|-------|------|
| Bot | Grammy (TypeScript) |
| API | Express.js |
| DB | SQLite + Prisma |
| Frontend | Vite + React |
| Wallets | Privy (MPC, non-custodial) |
| Solana DEX | Jupiter API |
| Cross-Chain | LI.FI API |
| AI | Google Gemini |

## Quick Start

```bash
npm install
cp .env.example .env  # Fill in your API keys
npx prisma generate && npx prisma db push
npm run dev
```

## Deployment

- **Backend (bot + API)**: Hostinger VPS via PM2 (`ecosystem.config.js`)
- **Frontend (Mini App)**: Vercel (root: `webapp/`)

## Documentation

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Master context — project status, phases, all details |
| `ARCHITECTURE.md` | System design and deployment guide |
| `API.md` | API endpoint reference |
| `SECURITY.md` | Security model (Privy MPC, fee collection) |
| `TESTING.md` | Testing guide and production checklist |

## License

MIT
