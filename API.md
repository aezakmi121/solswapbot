# API.md — API Reference

## Jupiter Swap API (v1)

**Base URL:** `https://lite-api.jup.ag/swap/v1` (free, no API key needed)

### GET /quote

Get the best swap route with your fee baked in.

```
GET /quote?inputMint=<MINT>&outputMint=<MINT>&amount=<LAMPORTS>&slippageBps=50&platformFeeBps=50
```

### POST /swap

Build the swap transaction for client-side signing.

```json
POST /swap
{
  "quoteResponse": { ... },
  "userPublicKey": "<WALLET_ADDRESS>",
  "feeAccount": "<FEE_WALLET_ADDRESS>"
}
```

Returns `{ swapTransaction: "<base64>", lastValidBlockHeight: number }`

---

## SolSwap REST API (Express)

Served from VPS on port 3001. Used by the Mini App frontend.

### GET /api/quote

Returns Jupiter quote + display data (USD values, exchange rate, fees).

**Query params:** `inputMint`, `outputMint`, `amount`, `inputSymbol`, `outputSymbol`

**Response:**
```json
{
  "quote": { ... },
  "display": {
    "inputAmount": 1.0,
    "outputAmount": "148.32",
    "outputTokens": 148.32,
    "exchangeRate": 148.32,
    "feeAmount": "0.74",
    "feeUsd": 0.74,
    "inputUsd": 148.50,
    "outputUsd": 148.32,
    "priceImpactPct": 0.01,
    "slippageBps": 50
  }
}
```

### POST /api/swap

Builds unsigned transaction for wallet-adapter signing.

**Body:** `{ quoteResponse, userPublicKey }`

**Response:** `{ swapTransaction: "<base64>", lastValidBlockHeight: number }`

### GET /api/price/:mint

Returns USD price. **Response:** `{ mint, priceUsd: 148.50 }`

### GET /api/tokens

Returns supported tokens list with icons/decimals.

### GET /api/health

Health check. **Response:** `{ status: "ok", timestamp: ... }`

---

## Token Addresses

| Token | Mint |
|-------|------|
| SOL | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |
| WIF | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |

## Fee Model

- Our fee: 0.5% (50 bps) via `platformFeeBps`
- Jupiter's cut: 2.5% of our fee (negligible)
- Net to us: ~48.75 bps per swap
- Jupiter free tier: ~600 req/min
