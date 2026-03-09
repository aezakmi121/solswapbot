# Testing

## Quick Commands

```bash
npm test              # Backend vitest suite (22 tests)
npm run test:smoke    # Backend smoke tests via Node built-in runner (23 tests)
npm run test:live     # Integration smoke tests against localhost:3001 (curl-based)
npm run test:live:prod # Integration smoke tests against production VPS
npm run validate-keys # Validate all API keys & config against live services
npm run lint          # Type-check without emit
npm run build         # Compile TypeScript (must pass with zero errors)

cd webapp && npm test       # Frontend vitest suite (5 tests)
cd webapp && npm run build  # Frontend build (tsc + vite)
```

## Test Suites

### Backend Unit Tests (`npm run test:smoke`)
- **File**: `src/__tests__/smoke.test.ts`
- **Runner**: Node built-in test runner
- **Tests**: 23 — Telegram HMAC auth, auth expiry/replay, platform fee bypass, Solana address validation

### Backend Vitest Suite (`npm test`)
- **Files**: `src/api/routes/__tests__/*.test.ts`, `src/db/queries/__tests__/*.test.ts`
- **Tests**: 22 — price validation, quote endpoints, scan rate limiting, transaction filtering, fee queries, referral calculations

### Frontend Vitest Suite (`cd webapp && npm test`)
- **Files**: `webapp/src/components/__tests__/*.test.tsx`
- **Tests**: 5 — AdminPanel (loading/error/render), SwapPanel (balance validation, slippage)

### Integration Smoke Tests (`npm run test:live`)
- **File**: `scripts/smoke-test.sh`
- **Tests**: 13 curl-based tests against live server (health, tokens, price, quotes, auth)

## Bot Testing
1. Start bot in dev mode: `npm run dev`
2. Open Telegram → Send `/start` to your bot
3. Verify: Welcome message appears with "Open SolSwap" button
4. Tap button → Mini App should open (5-tab UI: Wallet | Swap | Scan | History | Settings)
5. Send any random text → bot should reply with Mini App redirect

## API Testing

```bash
# Health check
curl http://localhost:3001/api/health

# Quote (SOL → USDC, 0.5 SOL)
curl "http://localhost:3001/api/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&humanAmount=0.5"

# Token scan (BONK)
curl "http://localhost:3001/api/scan?mint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"

# Price (SOL)
curl http://localhost:3001/api/price/So11111111111111111111111111111111111111112

# Supported tokens
curl http://localhost:3001/api/tokens

# Cross-chain chains list
curl http://localhost:3001/api/cross-chain/chains
```

## Feature Test Status

| Feature | Status | Notes |
|---------|--------|-------|
| Privy wallet flow | Testable | Privy SDK fully integrated. Manual test in Mini App. |
| End-to-end swap signing | Testable | Privy signs in-browser. Requires real SOL for live test. |
| Tab navigation (5 tabs) | Testable | Wallet, Swap, Scan, History, Settings |
| Admin dashboard | Testable | Set ADMIN_TELEGRAM_ID to see Admin tab |
| Token scanner | Testable | 5/day free limit for FREE tier |
| Send/receive flow | Testable | Send requires SOL. Receive tracked via Helius webhooks. |
| Cross-chain bridge | Testable | Solana-originated only. LI.FI bridge execution live. |
| Helius webhooks | Testable | Requires HELIUS_API_KEY + HELIUS_WEBHOOK_SECRET |
| Whale tracker | Not mounted | Code exists but router not wired in server.ts |
| Subscription payments | Not implemented | Schema only, no Telegram Stars flow |
| AI signals | Not implemented | Phase 4 |

## Production Checklist

- [x] Set `NODE_ENV=production`
- [x] Set `CORS_ORIGIN` to Vercel Mini App URL (not `*`)
- [x] Set all required env vars on VPS
- [x] Run `npx prisma db push` on production DB
- [x] Configure PM2 with `ecosystem.config.js`
- [x] Set BotFather Menu Button URL to Vercel deployment
- [x] Test /start command opens Mini App
- [x] Verify Jupiter quote returns with platformFee
- [x] Configure Helius webhooks for receive tracking
- [x] Set LIFI_API_KEY for cross-chain fee collection
- [x] Run `npm run validate-keys` (20/20 checks pass)
- [ ] Manual end-to-end swap with real SOL
- [ ] Soft launch to 50-100 users
