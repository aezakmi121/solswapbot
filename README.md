# SolSwap — Telegram Trading Suite

A non-custodial, cross-chain token trading app built as a **Telegram Mini App**. Swap tokens across Solana, Ethereum, and more — without ever leaving Telegram.

## Features

- **🔄 Cross-Chain Swaps** — Swap SOL ↔ ETH, USDC ↔ BNB, and more via Jupiter + LI.FI
- **🔍 Token Scanner** — Paste any contract address, get an instant safety score and rug-pull analysis
- **🐋 Whale Tracker** — Follow smart money wallets and get instant trade alerts
- **🤖 AI Signals** — Daily market analysis and trade signals powered by AI
- **💰 Zero Custody** — We never hold your keys. Privy MPC wallets sign inside the Mini App

## How It Works

1. User opens the bot in Telegram → taps **"Open SolSwap"**
2. Mini App creates an embedded wallet via Privy (automatic, one tap)
3. User deposits SOL/ETH and starts trading — everything happens in-app
4. Revenue earned via platform fees (0.5% per swap) + subscriptions + affiliate links

## Tech Stack

| Layer | Tech |
|-------|------|
| Bot | Grammy (TypeScript) |
| API | Express.js |
| DB | SQLite + Prisma |
| Frontend | Vite + React |
| Wallets | Privy (MPC, non-custodial) |
| Solana DEX | Jupiter API |
| Cross-Chain | LI.FI API (no key required) |
| AI | Google Gemini |

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in your API keys

# Generate Prisma client
npx prisma generate
npx prisma db push

# Run in dev mode
npm run dev
```

## Deployment

- **Backend (bot + API)**: VPS via PM2 (`ecosystem.config.js`)
- **Frontend (Mini App)**: Vercel (root: `webapp/`)

See `ARCHITECTURE.md` for full deployment guide.

## Documentation

| File | Purpose |
|------|---------|
| `CONTEXT.md` | Full project context for AI assistants |
| `ARCHITECTURE.md` | Technical architecture and deployment |
| `API.md` | API endpoint reference |
| `SECURITY.md` | Security model (Privy MPC) |

## License

MIT
