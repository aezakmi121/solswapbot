# API Reference

Base URL: `http://YOUR_VPS_IP:3001/api`

## Health

### `GET /api/health`
Returns server status.

**Response:** `{ "status": "ok", "timestamp": 1234567890 }`

---

## Swap

### `GET /api/quote`
Get a swap quote with platform fee.

| Param | Type | Description |
|-------|------|-------------|
| `inputMint` | string | Source token mint address |
| `outputMint` | string | Destination token mint address |
| `amount` | string | Amount in smallest unit (lamports, etc.) |
| `slippageBps` | number | Optional. Default: 50 |
| `crossChain` | boolean | Optional. If true, uses Rango for cross-chain routing |

**Response:** Jupiter QuoteResponse with platformFee included.

### `POST /api/swap`
Build an unsigned swap transaction.

| Body Param | Type | Description |
|------------|------|-------------|
| `quoteResponse` | object | Quote from `/api/quote` |
| `userPublicKey` | string | User's Solana wallet address |

**Response:** `{ "swapTransaction": "<base64>", "lastValidBlockHeight": 12345 }`

---

## Token Scanner

### `GET /api/scan`
Analyze a token for safety.

| Param | Type | Description |
|-------|------|-------------|
| `mint` | string | Token mint address |

**Response:**
```json
{
  "riskScore": 12,
  "riskLevel": "LOW",
  "checks": {
    "mintAuthority": { "safe": true, "detail": "Disabled" },
    "freezeAuthority": { "safe": true, "detail": "Disabled" },
    "topHolders": { "safe": true, "detail": "Top 10 hold 28%" },
    "liquidity": { "safe": true, "detail": "$2.1M" },
    "tokenAge": { "safe": true, "detail": "2+ years" },
    "devWallet": { "safe": false, "detail": "Holds 3.2%" }
  },
  "tokenInfo": {
    "name": "BONK",
    "symbol": "BONK",
    "supply": "93.5T",
    "holders": 845000,
    "price": 0.0000182
  }
}
```

---

## Price

### `GET /api/price/:mint`
Get USD price for a token.

**Response:** `{ "price": 148.50, "mint": "So11...112" }`

---

## Tokens

### `GET /api/tokens`
List supported tokens with mint addresses and icons.

---

## User

### `GET /api/user`
Get user info by Telegram initData.

| Header | Description |
|--------|-------------|
| `x-telegram-init-data` | Telegram WebApp initData string |

---

## History

### `GET /api/history`
Get user's last 10 swaps.

| Header | Description |
|--------|-------------|
| `x-telegram-init-data` | Telegram WebApp initData string |

---

## Webhooks

### `POST /api/webhooks/helius`
Receives Helius webhook events for tracked wallets.

| Header | Description |
|--------|-------------|
| `authorization` | Helius webhook secret |
