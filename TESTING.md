# TESTING.md — Testing Guide

## Strategy

Jupiter only works on **mainnet**. Bot commands + DB work on devnet. Full swap flow requires mainnet + a few cents of SOL.

## Layer 1: Bot Commands (free)

```
/start → Welcome message
/connect <DEVNET_ADDR> → Save wallet
/wallet → Show balance
/referral → Show link
/history → Show "No swaps yet"
/help → Command list
/trade → Mini App button (needs MINIAPP_URL set)
```

## Layer 2: Mini App (free, read-only)

1. Start backend: `npm run dev`
2. Start webapp: `cd webapp && npm run dev`
3. Open Mini App URL in browser
4. Connect wallet
5. Select SOL → USDC, enter 0.001
6. Verify quote appears with breakdown
7. Cancel (don't sign during testing)

## Layer 3: Full Swap (mainnet, ~$0.01)

```
1. Set SOLANA_RPC_URL to mainnet Helius RPC
2. npm run dev
3. Open Mini App via /trade in Telegram
4. Connect Phantom (mainnet)
5. Swap 0.001 SOL → USDC
6. Sign in Phantom
7. Check fee wallet on Solscan
```

## Layer 4: API Endpoints

```bash
# Health check
curl http://localhost:3001/api/health

# Get tokens
curl http://localhost:3001/api/tokens

# Get quote
curl "http://localhost:3001/api/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000&inputSymbol=SOL&outputSymbol=USDC"

# Get price
curl http://localhost:3001/api/price/So11111111111111111111111111111111111111112
```

## Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | /start | Welcome message |
| 2 | /connect valid | "Wallet connected!" |
| 3 | /connect invalid | Error |
| 4 | /wallet | Balance shown |
| 5 | /price SOL | USD price |
| 6 | /trade | Mini App button |
| 7 | Mini App opens | Swap form loads |
| 8 | Quote fetches | Breakdown shown |
| 9 | Wallet connects | Address shown |
| 10 | Swap executes | Tx confirmed |
| 11 | API /health | Status ok |
| 12 | Rate limiting | Gets limited on spam |
