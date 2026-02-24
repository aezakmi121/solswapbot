# Testing

## Build Check
```bash
npm run build    # Must pass with zero errors
npm run lint     # Type-check without emit
```

## Bot Testing
1. Start bot in dev mode: `npm run dev`
2. Open Telegram → Send `/start` to your bot
3. Verify: Welcome message appears with "Open SolSwap" button
4. Tap button → Mini App should open
5. Send any random text → bot should reply with "Use the Mini App" redirect

## API Testing

```bash
# Health check
curl http://localhost:3001/api/health

# Quote (SOL → USDC, 1 SOL)
curl "http://localhost:3001/api/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000"

# Token scan (BONK)
curl "http://localhost:3001/api/scan?mint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"

# Price (SOL)
curl http://localhost:3001/api/price/So11111111111111111111111111111111111111112

# Supported tokens
curl http://localhost:3001/api/tokens

# Cross-chain chains list
curl http://localhost:3001/api/cross-chain/chains

# Cross-chain tokens (Solana)
curl "http://localhost:3001/api/cross-chain/tokens?chain=solana"

# Cross-chain quote (SOL → ETH)
curl "http://localhost:3001/api/cross-chain/quote?fromChain=solana&toChain=ethereum&fromToken=SOL&toToken=ETH&amount=1"
```

## Mini App Testing
1. `cd webapp && npm run dev`
2. Open in browser at localhost
3. Test swap form: select tokens, enter amount, verify quote loads
4. Verify dark theme renders correctly
5. Test on mobile viewport (375px width)

## What's NOT Testable Yet

| Feature | Reason | Phase |
|---------|--------|-------|
| Privy wallet flow | SDK not integrated | Phase 1 |
| End-to-end swap signing | Needs Privy | Phase 1 |
| Tab navigation (Scan/Track/Signals) | UI not built | Phase 2 |
| Helius webhooks | Not implemented | Phase 3 |
| Subscription payments | Not implemented | Phase 3 |
| AI signals | Not implemented | Phase 4 |

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGIN` to Vercel Mini App URL (not `*`)
- [ ] Configure nginx reverse proxy with HTTPS
- [ ] Set all required env vars on VPS
- [ ] Run `npx prisma db push` on production DB
- [ ] Configure PM2 with `ecosystem.config.js`
- [ ] Set BotFather Menu Button URL to Vercel deployment
- [ ] Test /start command opens Mini App
- [ ] Verify Jupiter quote returns with platformFee
