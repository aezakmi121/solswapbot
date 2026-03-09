# SolSwap — Telegram Trading Suite

A non-custodial, cross-chain token trading app built as a **Telegram Mini App**. Swap tokens across Solana, Ethereum, and more — without ever leaving Telegram.

## Features

| Feature | Status |
|---------|--------|
| Solana Swaps — SOL, USDC, memecoins via Jupiter (0.5% fee) | Live |
| Cross-Chain Bridges — SOL ↔ ETH, BNB, MATIC, ARB, BASE via LI.FI | Live (Solana-originated) |
| Token Scanner — Paste any contract, get instant safety score (0-100) | Live (5/day free) |
| Multi-Chain Portfolio — Solana + 5 EVM chains via Moralis | Live |
| Send/Receive — SOL + SPL transfers with QR codes | Live |
| Transaction History — Swaps, sends, receives with date/type filters | Live |
| Non-Custodial Wallets — Privy MPC (Solana + EVM, auto-created) | Live |
| Admin Dashboard — Revenue analytics, user management, referral tracking | Live |
| Whale Tracker — Follow smart money wallets, get alerts | Backend done, not mounted |
| AI Signals — Daily market analysis powered by Gemini | Planned (Phase 4) |

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
| EVM Balances | Moralis API |
| AI | Google Gemini (Phase 4) |

## Quick Start

```bash
# Backend
npm install
cp .env.example .env  # Fill in your API keys
npx prisma generate && npx prisma db push
npm run dev

# Frontend (separate terminal)
cd webapp && npm install && npm run dev
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
