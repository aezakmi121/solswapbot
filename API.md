# API.md — Jupiter API Integration Reference

## Overview

We use Jupiter's **Metis Swap API (v6)** — their most current and recommended API as of January 2025. The previous "Referral Program" approach is no longer needed; fees are now set directly via API parameters.

**Base URL:** `https://quote-api.jup.ag/v6`

**Authentication:** None required for standard usage. Rate limit: ~600 requests/minute per IP. For higher limits, use Helius's Jupiter endpoint with their API key.

**Jupiter's fee cut:** 2.5% of whatever `platformFeeBps` you set. If you set 50 bps (0.5%), Jupiter keeps 2.5% of that (1.25 bps), you net ~48.75 bps. Practically negligible.

---

## Endpoint 1: Get Quote

`GET /quote`

Gets the best swap route with your fee baked in.

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputMint` | string | Yes | Token address being sold |
| `outputMint` | string | Yes | Token address being bought |
| `amount` | number | Yes | Amount in smallest unit (lamports for SOL) |
| `slippageBps` | number | No | Max slippage in basis points. Default: 50 (0.5%) |
| `platformFeeBps` | number | No | YOUR fee in basis points. Set to 50 for 0.5% |
| `onlyDirectRoutes` | boolean | No | Simpler routes — safer for large amounts |
| `asLegacyTransaction` | boolean | No | Set `false` — use versioned transactions |

### Example Request

```typescript
const params = new URLSearchParams({
  inputMint: 'So11111111111111111111111111111111111111112',  // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC
  amount: '1000000000',  // 1 SOL in lamports
  slippageBps: '50',
  platformFeeBps: '50',  // Our 0.5% fee
})

const response = await fetch(`${JUPITER_API_URL}/quote?${params}`)
const quote = await response.json()
```

### Response Shape (key fields)

```typescript
interface QuoteResponse {
  inputMint: string
  inAmount: string          // Actual input amount
  outputMint: string
  outAmount: string         // Expected output in smallest unit
  otherAmountThreshold: string  // Minimum output (with slippage)
  swapMode: 'ExactIn' | 'ExactOut'
  slippageBps: number
  platformFee: {
    amount: string          // Fee amount in output token units
    feeBps: number          // Your platformFeeBps
  }
  priceImpactPct: string    // Price impact percentage
  routePlan: RoutePlan[]    // The route Jupiter will take
  contextSlot: number
  timeTaken: number
}
```

### Important Notes on Quote Response

- `outAmount` is the expected output BEFORE your fee is deducted
- `platformFee.amount` is how much goes to your fee account
- Always show the user `outAmount - platformFee.amount` as what they'll receive
- Quote is valid for approximately 30 seconds — don't wait too long before building swap

---

## Endpoint 2: Build Swap Transaction

`POST /swap`

Builds the actual transaction. This is what the user signs.

### Request Body

```typescript
interface SwapRequest {
  quoteResponse: QuoteResponse  // The full response from /quote
  userPublicKey: string         // User's Phantom wallet address
  feeAccount: string            // YOUR wallet address that receives fees
  wrapAndUnwrapSol?: boolean    // Default true — handles SOL wrapping
  asLegacyTransaction?: boolean // Default false — use versioned tx
  destinationTokenAccount?: string  // Optional: specific output account
}
```

### Example Request

```typescript
const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    quoteResponse: quote,
    userPublicKey: user.walletAddress,
    feeAccount: process.env.FEE_WALLET_ADDRESS,
    wrapAndUnwrapSol: true,
    asLegacyTransaction: false,
  })
})

const { swapTransaction } = await swapResponse.json()
// swapTransaction is a base64-encoded serialized transaction
```

### Response Shape

```typescript
interface SwapResponse {
  swapTransaction: string     // Base64 serialized transaction — this is what we send to Phantom
  lastValidBlockHeight: number  // Transaction expires after this block
  prioritizationFeeLamports: number  // Priority fee added
}
```

---

## Phantom Deeplink Construction

After getting the `swapTransaction` from Jupiter, we create a deeplink that opens Phantom for the user to sign.

### Deeplink Format

```
phantom://v1/signAndSendTransaction
  ?app_url=<YOUR_APP_URL>
  &redirect_link=<WHERE_TO_RETURN_AFTER>
  &transaction=<BASE64_ENCODED_TRANSACTION>
```

For HTTPS (recommended):
```
https://phantom.app/ul/v1/signAndSendTransaction
  ?app_url=https%3A%2F%2Fyourbot.com
  &redirect_link=https%3A%2F%2Ft.me%2FYourBotName
  &transaction=<BASE64_ENCODED_TRANSACTION>
```

### TypeScript Implementation

```typescript
function buildPhantomDeeplink(
  swapTransaction: string,
  botUsername: string,
  appUrl: string
): string {
  const params = new URLSearchParams({
    app_url: appUrl,
    redirect_link: `https://t.me/${botUsername}`,
    transaction: swapTransaction,  // Already base64 from Jupiter
  })
  
  return `https://phantom.app/ul/v1/signAndSendTransaction?${params}`
}
```

### Important Notes on Deeplinks

- The `redirect_link` brings the user back to your bot after signing
- Phantom will show the transaction details before signing — user can review
- If user cancels, they return to bot via redirect link — handle this gracefully
- Deeplink works on mobile (iOS/Android Phantom app)
- On desktop, users can use Phantom browser extension — different flow (show QR code)

---

## Token Price API

Jupiter also provides a price endpoint:

`GET https://price.jup.ag/v4/price?ids=<TOKEN_MINT>`

```typescript
const response = await fetch(
  `https://price.jup.ag/v4/price?ids=So11111111111111111111111111111111111111112`
)
const data = await response.json()
// data.data["So111..."].price → SOL price in USD
```

---

## Common Token Mint Addresses

```typescript
export const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
} as const
```

For user-provided token names, use Jupiter's token list API:
`GET https://token.jup.ag/strict` — returns all verified tokens with names and addresses.

---

## Error Handling

Jupiter API returns errors in this shape:

```typescript
interface JupiterError {
  error: string          // Human-readable error
  statusCode?: number    // HTTP status code
}
```

### Common Errors and Handling

| Error | Cause | Bot Response |
|-------|-------|-------------|
| `"No routes found"` | No liquidity path between tokens | "No swap route found for this pair. Try a different amount or token." |
| `"Slippage tolerance exceeded"` | Price moved too much | "Price moved too much. Try increasing slippage in /settings or retry." |
| `"Token account not found"` | User doesn't have the input token | "You don't have any [TOKEN] in your wallet." |
| `"Insufficient balance"` | Not enough tokens | "Insufficient balance. You need at least [AMOUNT] [TOKEN]." |
| Rate limit (429) | Too many requests | Retry with exponential backoff |

---

## Fee Calculation Example

```
User swaps 100 USDC → SOL
Our platformFeeBps = 50 (0.5%)

Jupiter quote:
- inAmount: 100,000,000 (100 USDC, 6 decimals)
- outAmount: 1,500,000,000 (1.5 SOL, 9 decimals, before fee)
- platformFee.amount: 7,500,000 (0.0075 SOL = 0.5% of output)

User actually receives: 1,500,000,000 - 7,500,000 = 1,492,500,000 lamports
= 1.4925 SOL

Our fee wallet receives: 7,500,000 lamports = 0.0075 SOL
At $150/SOL = $1.125 earned from this one swap

Jupiter keeps 2.5% of our fee:
= 0.0075 * 0.025 = 0.0001875 SOL → negligible
```

---

## Rate Limiting Strategy

To stay within Jupiter's limits:

```typescript
// Implement a simple queue for Jupiter API calls
// Max 600 requests/minute = 10 requests/second
// With 50 users actively swapping, each gets ~12 requests/minute budget

// Use a token bucket or simple per-user cache:
// Cache quote results for 15 seconds — if same user requests same pair,
// return cached quote rather than hitting Jupiter again
```

---

## Upgrading to Paid Jupiter API

If you exceed free tier limits:

1. Sign up at https://portal.helius.dev
2. Get a Helius API key (free tier gives 100K requests/day)
3. Use Helius's Jupiter endpoint: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
4. Update `JUPITER_API_URL` in `.env`

Helius free tier is more than enough for the first 6 months of operation.

---

## Devnet Testing

For development, use Jupiter's devnet:
- **Devnet API:** `https://quote-api.jup.ag/v6` (same URL, but use devnet tokens)
- **Devnet SOL faucet:** `https://faucet.solana.com`
- **Devnet connection:** `https://api.devnet.solana.com`

Note: Liquidity on devnet is very limited. Test with small amounts and common pairs (SOL/USDC).
