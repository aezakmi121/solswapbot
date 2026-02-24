# Security Model

## Non-Custodial Architecture

SolSwap **never holds user private keys**. All wallet operations are handled by Privy's MPC (Multi-Party Computation) infrastructure.

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
| Can a user lose access? | Only if they lose their Telegram account AND Privy's infra goes down simultaneously |

## Revenue Fee Collection

Platform fees are collected **on-chain, trustlessly** via Jupiter's referral program:

1. We pass `platformFeeBps=50` in the Jupiter quote API call
2. Jupiter's on-chain program automatically deducts 0.5% and sends it to `FEE_WALLET_ADDRESS`
3. We never touch user funds — the DEX protocol handles fee splitting

## API Security

- **CORS**: Restricted to Mini App origin in production
- **Rate Limiting**: Grammy middleware limits bot command frequency
- **Input Validation**: All user input sanitized via `utils/validation.ts`
- **Env Validation**: All environment variables validated at startup via Zod schemas
- **Telegram initData**: Mini App verifies Telegram WebApp initData to authenticate users

## Data Storage

- **Database**: SQLite file on VPS — contains user IDs, swap history, scan results
- **No sensitive data**: No private keys, no wallet seeds, no passwords
- **Minimal PII**: Only Telegram user ID and optional username stored

## Webhook Security

- Helius webhooks verified via `HELIUS_WEBHOOK_SECRET` header
- Only processes events for wallets in our WatchedWallet table
