# Testing

## Build Check
```bash
npm run build    # Must pass with zero errors
npm run lint     # Type-check
```

## Bot Testing
1. Start bot in dev mode: `npm run dev`
2. Open Telegram → Send `/start` to your bot
3. Verify: Welcome message appears with "Open SolSwap" button
4. Tap button → Mini App should open

## API Testing
```bash
# Health check
curl http://localhost:3001/api/health

# Quote
curl "http://localhost:3001/api/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000"

# Token scan
curl "http://localhost:3001/api/scan?mint=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"

# Price
curl http://localhost:3001/api/price/So11111111111111111111111111111111111111112
```

## Mini App Testing
1. `cd webapp && npm run dev`
2. Open in browser at localhost
3. Test each tab: Swap, Scan, Track, Signals
4. Verify Privy login flow
5. Test on mobile viewport (375px width)

## Webhook Testing
Use Helius webhook simulator to test whale alerts:
```bash
curl -X POST http://localhost:3001/api/webhooks/helius \
  -H "Content-Type: application/json" \
  -H "authorization: YOUR_WEBHOOK_SECRET" \
  -d '{"type":"SWAP","signature":"test123"}'
```
