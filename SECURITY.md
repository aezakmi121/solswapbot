# Security Model

## Non-Custodial Architecture

SolSwap **never holds user private keys**. All wallet operations are handled by Privy's MPC (Multi-Party Computation) infrastructure.

> **Implementation Status:** Privy is fully integrated since v0.5.0. Embedded wallets
> (Solana + EVM) are created on first login via `@privy-io/react-auth`. All transaction
> signing happens in-browser via `useSignAndSendTransaction`. Private keys never touch
> our servers.

### How Privy MPC Works

1. When a user first opens the Mini App, Privy generates a wallet keypair
2. The private key is **split into shards** using MPC
3. One shard is held by Privy's secure infrastructure
4. The other shard is held client-side (in the user's browser/device)
5. **Neither party can sign transactions alone** — both shards are required
6. Signing reconstructs the key temporarily in a secure enclave, signs, then discards

### What This Means For Us

| Concern | Status |
|---------|--------|
| Do we hold private keys? | **No** |
| Can we move user funds? | **No** |
| Can our DB leak compromise wallets? | **No** — keys aren't in our DB |
| Is there a single point of failure? | **No** — MPC eliminates this |
| Can a user lose access? | Only if they lose Telegram account AND Privy infra goes down |

## Revenue Fee Collection

Platform fees are collected **on-chain, trustlessly** via Jupiter's referral program:

1. We pass `platformFeeBps=50` in the Jupiter quote API call
2. Jupiter's on-chain program automatically deducts 0.5% and sends it to `FEE_WALLET_ADDRESS`
3. We never touch user funds — the DEX protocol handles fee splitting
4. Server-side validation ensures `platformFeeBps` matches config (prevents fee bypass attacks)

**Status:** Implemented in `src/jupiter/quote.ts` and `src/jupiter/swap.ts`.

## API Security

| Layer | Implementation | Status |
|-------|---------------|--------|
| **Telegram initData HMAC** | HMAC-SHA256 verification of signed initData on all protected routes | DONE |
| **Auth expiry** | initData rejected if `auth_date` > 1 hour old (replay prevention) | DONE |
| **CORS** | Restricted to `CORS_ORIGIN` env var; crashes on `"*"` in production | DONE |
| **Rate Limiting** | 100 req/min per IP (express-rate-limit) + per-user per-command (Grammy) | DONE |
| **Security Headers** | Helmet middleware on all responses | DONE |
| **Input Validation** | All user input validated via `utils/validation.ts` + Zod schemas | DONE |
| **Address Validation** | `isValidSolanaAddress()` for wallets, `isValidPublicKey()` for mints | DONE |
| **Env Validation** | All env vars validated at startup via Zod (crash-early) | DONE |
| **Zod on External APIs** | Jupiter + LI.FI responses validated with Zod schemas | DONE |
| **Fee Bypass Prevention** | Server validates `platformFee.feeBps === PLATFORM_FEE_BPS` before building tx | DONE |
| **Swap Ownership** | `/api/swap/status` enforces user ownership check | DONE |
| **BigInt Validation** | `inputAmount`/`outputAmount` validated as integer strings before `BigInt()` | DONE |
| **GDPR Deletion** | `DELETE /api/user` cascade-deletes all user records (transactional) | DONE |
| **Webhook Auth (Helius)** | `POST /api/webhook/helius` validates `Authorization` header against secret | DONE |
| **Webhook Auth (Moralis)** | `POST /api/webhook/moralis` validates `x-signature` HMAC-SHA256 against `MORALIS_WEBHOOK_SECRET` | DONE |

## Auth Middleware Behavior

- Valid: sets `res.locals.telegramId`, calls `next()`
- Missing header: `401 { error: "Missing Authorization header" }`
- Invalid format: `401 { error: "Invalid Authorization format. Expected: tma <initData>" }`
- Invalid signature: `401 { error: "Invalid initData signature" }`
- Expired (>1hr): `401 { error: "initData expired" }`
- Missing user field: `401 { error: "Missing user in initData" }`

## Rate Limits

| Scope | Limit |
|-------|-------|
| Global API | 100 requests/min per IP |
| /start command | 1 per 30 seconds per user |
| swap command | 3 per 10 seconds per user |

## Data Storage

- **Database**: SQLite file on VPS — contains user IDs, swap history, scan results
- **No sensitive data**: No private keys, no wallet seeds, no passwords
- **Minimal PII**: Only Telegram user ID and optional username stored
- **DB file location**: `prisma/dev.db` (not committed to git)

## Resolved Security Issues

All 7 CRITICAL + 3 HIGH + 5 MEDIUM security issues have been fixed. See CLAUDE.md
Security Model section for the full table.
