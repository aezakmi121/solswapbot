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

### `POST /api/cross-chain/execute`
Build a signable LI.FI bridge transaction using the user's real wallet addresses. Only Solana-originated swaps are supported (`inputChain` must be `"solana"`). Returns a base64-encoded Solana VersionedTransaction ready to be signed with Privy.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inputToken` | string | Yes | Token symbol (e.g., `"SOL"`) |
| `outputToken` | string | Yes | Destination token symbol (e.g., `"USDC"`) |
| `inputChain` | string | Yes | Source chain (`"solana"` only for now) |
| `outputChain` | string | Yes | Destination chain (e.g., `"ethereum"`) |
| `amount` | string | Yes | Human-readable amount (e.g., `"1.5"`) |
| `slippageBps` | number | No | Slippage in basis points (0–5000, default 50) |
| `fromAddress` | string | Yes | User's Solana wallet address |
| `toAddress` | string | No | Destination address. Required for EVM output chains. Defaults to `fromAddress` for Solana output. |

**Response:** `{ transactionData: base64, lifiRouteId: string, outputAmount: string, outputAmountUsd: string }`

---

### `POST /api/cross-chain/confirm`
Record a completed bridge transaction in the DB after the user has signed and broadcast it.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txSignature` | string | Yes | Solana transaction signature |
| `inputToken` | string | Yes | Token symbol |
| `outputToken` | string | Yes | Destination token symbol |
| `inputChain` | string | Yes | Source chain |
| `outputChain` | string | Yes | Destination chain |
| `inputAmount` | string | Yes | Amount in smallest unit or human-readable |
| `outputAmount` | string | Yes | Expected output amount |
| `feeAmountUsd` | number | No | Bridge fee in USD |

**Response:** `{ swapId: string, status: "SUBMITTED" }`

---

### `GET /api/cross-chain/status`
Track the status of a LI.FI bridge transaction.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `txHash` | string | Yes | Source chain tx hash (Solana signature) |
| `fromChain` | string | Yes | Source chain name (e.g., `"solana"`) |
| `toChain` | string | Yes | Destination chain name (e.g., `"ethereum"`) |

**Response:** `{ status: "PENDING" | "DONE" | "FAILED" | "NOT_FOUND", receivingTxHash?: string | null }`

Poll every 5 s. `DONE` means funds have arrived at the destination. `PENDING` means bridge is in progress.

---

## User

### `GET /api/user`
Get or create user by Telegram initData.

| Header | Description |
|--------|-------------|
| `Authorization` | `tma <tg.initData>` |

**Response:**
```json
{
  "telegramId": "123456789",
  "walletAddress": "GsbwXf...",
  "evmWalletAddress": "0x742d35Cc...",
  "solBalance": 1.5,
  "referralCode": "abc123",
  "referralCount": 3
}
```

---

### `POST /api/user/wallet`
Register the user's Privy-managed Solana wallet address.

**Body:** `{ "walletAddress": "GsbwXf..." }`

**Response:** `{ "success": true }`

---

### `POST /api/user/evm-wallet`
Register the user's Privy-managed EVM wallet address. Called automatically by the Mini App when Privy creates the embedded Ethereum wallet on first login.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `evmWalletAddress` | string | Yes | EVM address (`0x` + 40 hex chars) |

**Response:** `{ "success": true }`

**Errors:**
- `400` — Missing or invalid EVM address format

---

### `GET /api/user/portfolio`
Get combined Solana + EVM token portfolio with USD values.

**Response:**
```json
{
  "totalValueUsd": 234.56,
  "walletAddress": "GsbwXf...",
  "evmWalletAddress": "0x742d35Cc...",
  "tokens": [
    {
      "chain": "solana",
      "mint": "So11111111111111111111111111111111111111112",
      "symbol": "SOL",
      "name": "Solana",
      "icon": "https://...",
      "amount": 1.5,
      "decimals": 9,
      "priceUsd": 148.50,
      "valueUsd": 222.75
    },
    {
      "chain": "ethereum",
      "mint": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "symbol": "USDC",
      "name": "USD Coin",
      "icon": "https://...",
      "amount": 11.81,
      "decimals": 6,
      "priceUsd": 1.0,
      "valueUsd": 11.81
    }
  ]
}
```

Token `chain` values: `"solana"` | `"ethereum"` | `"bsc"` | `"polygon"` | `"arbitrum"` | `"base"`

EVM tokens only appear if `MORALIS_API_KEY` is set and the user has an EVM wallet with non-zero balances.

---

## NOT YET IMPLEMENTED

The following endpoints are planned but do not exist yet:

| Endpoint | Phase | Description |
|----------|-------|-------------|
| `POST /api/subscribe` | Phase 3 | Telegram Stars subscription purchase |
