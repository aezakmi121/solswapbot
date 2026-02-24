# API Reference

Base URL: `http://YOUR_VPS_IP:3001/api`

---

## Health

### `GET /api/health`
Returns server status.

**Response:** `{ "status": "ok", "timestamp": 1234567890 }`

---

## Swap

### `GET /api/quote`
Get a swap quote with platform fee and USD breakdown.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `inputMint` | string | Yes | Source token mint address |
| `outputMint` | string | Yes | Destination token mint address |
| `amount` | string | Yes | Amount in smallest unit (lamports, etc.) |
| `slippageBps` | number | No | Default: 50 |

**Response:**
```json
{
  "quote": { "...Jupiter QuoteResponse with platformFee..." },
  "inputUsd": 148.50,
  "outputUsd": 147.76,
  "feeUsd": 0.74,
  "priceImpactPct": 0.01
}
```

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
Analyze a token for safety risks.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `mint` | string | Yes | Solana token mint address |

**Response:**
```json
{
  "riskScore": 12,
  "riskLevel": "LOW",
  "checks": {
    "mintAuthority": { "safe": true, "detail": "Disabled" },
    "freezeAuthority": { "safe": true, "detail": "Disabled" },
    "topHolders": { "safe": true, "detail": "Top 10 hold 28%" },
    "tokenAge": { "safe": true, "detail": "2+ years" }
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

Risk scoring: 0-20 = LOW, 21-50 = MEDIUM, 51+ = HIGH

---

## Price

### `GET /api/price/:mint`
Get USD price for a token via Jupiter Price API v3.

**Response:** `{ "price": 148.50, "mint": "So11...112" }`

---

## Tokens

### `GET /api/tokens`
List supported tokens with mint addresses, symbols, and decimals.

**Response:**
```json
[
  { "symbol": "SOL", "name": "Solana", "mint": "So11...", "decimals": 9, "icon": "..." },
  { "symbol": "USDC", "name": "USD Coin", "mint": "EPjF...", "decimals": 6, "icon": "..." }
]
```

---

## Cross-Chain

### `GET /api/cross-chain/quote`
Get a cross-chain swap quote via smart router (Jupiter for same-chain, LI.FI for cross-chain).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `fromChain` | string | Yes | Source chain (e.g., "solana", "ethereum") |
| `toChain` | string | Yes | Destination chain |
| `fromToken` | string | Yes | Source token symbol or address |
| `toToken` | string | Yes | Destination token symbol or address |
| `amount` | string | Yes | Human-readable amount (e.g., "1.5") |

**Response:**
```json
{
  "provider": "lifi",
  "fromChain": "solana",
  "toChain": "ethereum",
  "inputAmount": "1.5",
  "outputAmount": "0.0089",
  "route": "SOL → USDC → bridge → ETH",
  "estimatedTime": "5-10 min"
}
```

### `GET /api/cross-chain/chains`
List supported chains.

**Response:**
```json
[
  { "name": "Solana", "chainId": 1151111081099710 },
  { "name": "Ethereum", "chainId": 1 },
  { "name": "BNB Chain", "chainId": 56 },
  { "name": "Polygon", "chainId": 137 },
  { "name": "Arbitrum", "chainId": 42161 },
  { "name": "Base", "chainId": 8453 }
]
```

### `GET /api/cross-chain/tokens`
List tokens available on a specific chain.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `chain` | string | Yes | Chain name (e.g., "solana") |

---

## User

### `GET /api/user`
Get or create user by Telegram initData.

| Header | Description |
|--------|-------------|
| `x-telegram-init-data` | Telegram WebApp initData string |

**Response:** `{ "user": { "telegramId": "123", "walletAddress": "...", "referralCode": "..." }, "solBalance": 1.5 }`

---

## NOT YET IMPLEMENTED

The following endpoints are planned but do not exist yet:

| Endpoint | Phase | Description |
|----------|-------|-------------|
| `GET /api/history` | Phase 1 | User's swap history (last 10) |
| `POST /api/webhooks/helius` | Phase 3 | Helius webhook receiver for whale tracking |
| `POST /api/subscribe` | Phase 3 | Telegram Stars subscription purchase |
