# Security Model

## Non-Custodial Architecture

SolSwap **never holds user private keys**. All wallet operations are handled by Privy's MPC (Multi-Party Computation) infrastructure.

> **Implementation Status:** Privy is referenced in config but NOT yet integrated in the webapp.
> The current webapp uses a Phantom deep-link as a placeholder.
> Full Privy integration is Phase 1 priority.

### How Privy MPC Works (Target Architecture)

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

**Status:** Implemented in `src/jupiter/quote.ts` and `src/jupiter/swap.ts`.

## API Security — What's Implemented

| Layer | Implementation | Status |
|-------|---------------|--------|
| **CORS** | Restricted to `CORS_ORIGIN` env var | DONE |
| **Rate Limiting** | Per-user per-command via Grammy middleware | DONE |
| **Input Validation** | All user input sanitized via `utils/validation.ts` | DONE |
| **Address Validation** | Solana PublicKey validation on all address inputs | DONE |
| **Env Validation** | All env vars validated at startup via Zod (crash-early) | DONE |
| **Zod on External APIs** | Jupiter, LI.FI responses validated with Zod schemas | DONE |
| **Telegram initData** | Used in `/api/user` to identify users | DONE |
| **initData Signature Verification** | Cryptographic verification of Telegram initData | NOT YET |
| **Webhook Auth** | Helius webhook secret header verification | NOT YET (Phase 3) |

## Rate Limits

| Command/Route | Limit |
|--------------|-------|
| /start | 1 per 30 seconds |
| swap | 3 per 10 seconds |
| price | 10 per 60 seconds |

## Data Storage

- **Database**: SQLite file on VPS — contains user IDs, swap history, scan results
- **No sensitive data**: No private keys, no wallet seeds, no passwords
- **Minimal PII**: Only Telegram user ID and optional username stored
- **DB file location**: `prisma/dev.db` (not committed to git)

## Known Gaps (To Address)

1. **Telegram initData not cryptographically verified** — currently trusts the header value
2. **No HTTPS termination** — needs reverse proxy (nginx) in production
3. **CORS set to `*` by default** — must restrict to Mini App domain in production
4. **No API key authentication** — routes are open (relies on Telegram initData)
