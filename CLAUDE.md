# CLAUDE.md — Development Guide

## Quick Start
```bash
npm install
cp .env.example .env  # Fill in API keys
npx prisma generate && npx prisma db push
npm run dev
```

## Commands
- `npm run dev` — Start bot + API in dev mode (tsx watch)
- `npm run build` — Compile TypeScript
- `npm start` — Run production build
- `npm run lint` — Type-check without emit
- `cd webapp && npm run dev` — Start Mini App dev server

## Architecture (Read CONTEXT.md for Full Details)

**Mini App-first design.** The bot is only a launcher (`/start`). ALL features live in the Mini App.

**Non-custodial.** Privy MPC handles wallets. We never hold keys.

**Revenue via API params.** Jupiter `platformFeeBps` and LI.FI integrator fees. Zero liability.

## Key Files

| File | What It Does |
|------|-------------|
| `src/app.ts` | Entry point — starts bot + API |
| `src/config.ts` | Zod-validated env config |
| `src/bot/index.ts` | Grammy bot — only `/start` |
| `src/api/server.ts` | Express API for Mini App |
| `src/jupiter/quote.ts` | Jupiter quote with platform fee |
| `src/jupiter/swap.ts` | Jupiter swap TX builder |
| `webapp/src/App.tsx` | Mini App entry — tabbed UI |
| `prisma/schema.prisma` | Database schema |

## Coding Patterns

1. **Zod validation** on all external API responses
2. **Prisma queries** in `src/db/queries/` — one file per domain
3. **Retry wrapper** via `src/utils/retry.ts` for all HTTP calls
4. **Input sanitization** via `src/utils/validation.ts`
5. **Config validated at startup** — crash early on missing env vars

## Database
SQLite via Prisma. Migrations: `npx prisma db push`.

## Don't
- Add bot commands (use Mini App instead)
- Store private keys (Privy handles this)
- Use PostgreSQL (SQLite is sufficient)
- Allow unsanitized user input
