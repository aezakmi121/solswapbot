# SECURITY.md — Threat Model

## Core Guarantee

**We never hold user funds.** Non-custodial architecture eliminates the most catastrophic attack vector (key theft).

## Immune By Design

| Threat | Why Safe |
|--------|----------|
| Private key theft | We never generate or store keys |
| Database breach → fund drain | DB has only public addresses |
| Server compromise | No signing authority over user funds |

## Active Threats

### 1. Bot Token Theft (HIGH)
Store in `.env` only. Rotate via @BotFather if exposed.

### 2. API Server Abuse (HIGH)
- CORS restricted to Mini App origin in production
- Rate limiting on all endpoints
- Input validation via Zod

### 3. TWA initData Spoofing (MEDIUM)
- Validate Telegram `initData` on API requests
- Set `CORS_ORIGIN` to your Vercel URL in production

### 4. Malicious Transaction (MEDIUM)
- Display full quote breakdown before signing
- Conservative slippage (0.5%)
- Confirmation step before building transaction

### 5. Fake Bot Impersonation (MEDIUM)
- Register bot username early
- Warn users in `/start` that bot never DMs first

### 6. RPC Manipulation (LOW)
- Use dedicated RPC (Helius/QuickNode)
- Validate responses, retry with backoff

## Security Rules

1. Never store private keys
2. Never commit `.env`
3. Always validate inputs (Zod)
4. Rate limit all commands
5. CORS lock in production
6. SSH key auth only on VPS
7. `npm audit` before deploy

## Incident Response

1. `pm2 stop solswap-bot` — kill bot
2. Revoke bot token via @BotFather if compromised
3. Check logs, assess scope
4. Communicate transparently in announcement channel
5. Patch, review, redeploy
