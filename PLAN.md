# SolSwap — Comprehensive Fix & Deployment Plan

> Generated: 2026-02-25 | Based on: Full codebase audit + live testing feedback + latest docs research

---

## Current Situation Summary

### What's Working
- Telegram bot `/start` command launches the Mini App
- Privy login with Telegram works (auto-creates embedded Solana wallet)
- Mini App loads, shows swap UI with token selector
- Wallet address is saved to backend DB
- Logout button appears in the footer
- Token list loads from Jupiter API
- Backend API server runs on VPS (PM2)

### What's Broken (User-Reported Issues)

#### Issue 1: "Bot domain invalid" after logout
**Root Cause:** When Privy's `logout()` is called inside a Telegram Mini App, Privy performs an OAuth-style redirect/cleanup that navigates away from the Mini App. Telegram then shows "Bot domain invalid" because the redirect URL isn't in the bot's allowed domains. After dismissing this, the user lands back on the login screen — so it functionally works, but the error is jarring.

**Fix:** Handle logout gracefully:
- After calling `logout()`, immediately close the Mini App via `tg.close()` (the natural Telegram behavior)
- OR stay in-app: call `logout()`, catch any navigation, and show the login screen without redirecting
- Add a confirmation dialog before logout ("Are you sure? This will close the app.")

#### Issue 2: "Missing required params: inputMint, outputMint, amount" when entering swap amount
**Root Cause:** **The VPS backend has NOT been redeployed** since the recent code changes. The currently running backend on the VPS is an older version that uses different parameter names. The new code expects `humanAmount` (or `amount` as fallback), but the OLD deployed code likely has different validation logic or the endpoint structure differs.

There are **9 commits** ahead of `origin/main` that haven't been deployed:
```
3effe41 fix: price API, quote decimals, Privy RPC, balances, fee validation, CORS
5f658ec fix: critical financial bugs + real swap confirmation + balance display
5a0bd18 docs: comprehensive codebase audit
3e2a09f feat: replace hardcoded token list with Jupiter Token API
f851c5f fix: use useLoginWithTelegram for seamless Telegram auth
0f0b749 chore: ignore tsbuildinfo files
b646759 fix: add Privy Solana peer deps + .npmrc for Vercel build
e3ec67a feat: Phase 1 — Privy wallet integration + in-app swap signing
4133cd3 docs: overhaul all documentation to reflect actual codebase state
```

**Fix:** YES — you need to redeploy the VPS. Steps below.

---

## VPS Redeployment Steps

```bash
# SSH into VPS
ssh root@srv1418768.hstgr.cloud

# Navigate to project
cd /path/to/solswapbot

# Pull latest code (merge the branch or pull main after PR merge)
git pull origin main

# Install dependencies
npm install

# Build TypeScript
npm run build

# Push database schema changes
npx prisma db push

# Restart with PM2
pm2 restart ecosystem.config.js

# Verify it's running
pm2 logs solswap-bot --lines 20
curl http://localhost:3001/api/health
```

**Important:** The Vercel frontend auto-deploys on push to main. The VPS backend does NOT auto-deploy — it requires manual SSH + pull + build + restart.

---

## Current End-to-End Swap Workflow

```
┌─ USER OPENS BOT ─────────────────────────────────┐
│ 1. User sends /start to @SolSwapBot               │
│ 2. Bot creates user record in DB                   │
│ 3. Bot shows "Open SolSwap" button (Mini App URL)  │
└───────────────────────────────────────────────────┘
          │
          ▼
┌─ MINI APP LOADS ──────────────────────────────────┐
│ 4. Telegram opens Mini App (Vercel)                │
│ 5. tg.ready() + tg.expand() called                 │
│ 6. Privy auto-login with Telegram (useLoginWith    │
│    Telegram hook)                                   │
│ 7. Privy creates embedded Solana wallet (MPC)       │
│ 8. Wallet address saved to DB (POST /api/user/wall) │
│ 9. SOL balance + token balances fetched             │
│ 10. Default tokens loaded: SOL → USDC               │
└───────────────────────────────────────────────────┘
          │
          ▼
┌─ SWAP FLOW ───────────────────────────────────────┐
│ 11. User selects input/output tokens                │
│     (TokenSelector modal with search)               │
│ 12. User enters amount (e.g., "0.5")               │
│ 13. After 600ms debounce, quote fetched:            │
│     GET /api/quote?inputMint=X&outputMint=Y         │
│           &humanAmount=0.5                          │
│ 14. Backend converts humanAmount to lamports,       │
│     calls Jupiter API, fetches USD prices,          │
│     returns quote + display breakdown               │
│ 15. User sees: rate, fee, price impact, output amt  │
│ 16. User clicks "Swap X SOL for Y USDC"            │
│                                                     │
│ 17. POST /api/swap { quoteResponse, userPublicKey } │
│     → Backend validates fee not stripped             │
│     → Calls Jupiter to build unsigned TX            │
│     → Returns base64-encoded transaction            │
│                                                     │
│ 18. Privy signs + sends TX via embedded wallet      │
│     (useSignAndSendTransaction hook)                │
│                                                     │
│ 19. POST /api/swap/confirm { telegramId, txSig,     │
│     inputMint, outputMint, amounts, feeUsd }        │
│     → Creates Swap record in DB (SUBMITTED)         │
│     → Starts background on-chain polling            │
│                                                     │
│ 20. Frontend polls GET /api/swap/status every 3s    │
│     → Until CONFIRMED or FAILED or 2min timeout     │
│                                                     │
│ 21. Shows result: Solscan link + "New Swap" button  │
└───────────────────────────────────────────────────┘
```

### Other Available Features (Backend Ready)

| Feature | Endpoint | Frontend UI |
|---------|----------|-------------|
| Token scan | `GET /api/scan?mint=X` | NOT BUILT (Phase 2) |
| Cross-chain quote | `GET /api/cross-chain/quote` | NOT BUILT (Phase 2) |
| Cross-chain chains | `GET /api/cross-chain/chains` | NOT BUILT (Phase 2) |
| Cross-chain tokens | `GET /api/cross-chain/tokens` | NOT BUILT (Phase 2) |
| Price lookup | `GET /api/price/:mint` | Used internally by quote |
| Swap history | `GET /api/history` | DONE (slide-up panel) |

---

## Fixes to Implement Now

### Fix 1: Graceful Logout (Bot Domain Invalid)

**File:** `webapp/src/App.tsx`

**Current code (line 656):**
```jsx
<button className="logout-btn" onClick={logout}>Log out</button>
```

**Fix approach:**
```jsx
const handleLogout = async () => {
    // Ask for confirmation
    if (!window.confirm("Log out? This will close SolSwap.")) return;

    try {
        await logout();
    } catch (err) {
        console.error("Logout error:", err);
    }

    // Close the Mini App cleanly instead of letting Privy redirect
    if (tg?.close) {
        tg.close();
    }
};

// In JSX:
<button className="logout-btn" onClick={handleLogout}>Log out</button>
```

**Why this works:** Calling `tg.close()` immediately after logout sends the user back to the Telegram chat cleanly, before any Privy redirect can trigger the "bot domain invalid" error. Next time they open the Mini App, they'll see the login screen.

### Fix 2: Ensure Quote Params Are Sent Correctly

**File:** `webapp/src/lib/api.ts`

The frontend code is already correct — it sends `inputMint`, `outputMint`, and `humanAmount`. The issue is the **VPS is running old code**. After redeployment, this will work.

However, we should add defensive validation in the frontend:
```typescript
export async function fetchQuote(params: {
    inputMint: string;
    outputMint: string;
    humanAmount: string;
}): Promise<QuoteResponse> {
    // Validate before sending
    if (!params.inputMint || !params.outputMint || !params.humanAmount) {
        throw new Error("Missing quote parameters");
    }
    // ... rest of function
}
```

### Fix 3: Handle Quote Loading State Better

When tokens haven't loaded yet, the user shouldn't be able to type an amount. Add a loading state indicator and disable the input until tokens are ready.

---

## Technology Stack — Latest Docs & Versions

### 1. Privy React Auth SDK

**Current version in project:** `@privy-io/react-auth@3.14.1`
**Latest:** v3.14.x (February 2026). Requires React 18+ and TypeScript 5+.

**Major breaking changes in v2.0.0 (January 2025):**
- `useSendSolanaTransaction` removed from `@privy-io/react-auth` → now `useSignAndSendTransaction` from `@privy-io/react-auth/solana`
- `createPrivyWalletOnLogin` removed → use `config.embeddedWallets.createOnLogin`
- Callback signatures changed to named (destructured) arguments
- `setActiveWallet` removed — interact with wallets array directly
- `rpcUrl` removed from `fundWallet` → use `solanaClusters` or `solana.rpcs` config

**Key APIs used:**
- `usePrivy()` → `{ ready, authenticated, logout }`
- `useLoginWithTelegram()` → `{ login: loginWithTelegram }` (from `@privy-io/react-auth`)
- `useWallets()` → `{ wallets }` (from `@privy-io/react-auth/solana`)
- `useSignAndSendTransaction()` → `{ signAndSendTransaction }` (from `@privy-io/react-auth/solana`)

**Config pattern (current):**
```typescript
<PrivyProvider
  appId={PRIVY_APP_ID}
  config={{
    loginMethods: ["telegram"],
    embeddedWallets: {
      solana: { createOnLogin: "all-users" }
    },
    solana: {
      rpcs: {
        "solana:mainnet": {
          rpc: createSolanaRpc(RPC_URL),           // from @solana/kit
          rpcSubscriptions: createSolanaRpcSubscriptions(WS_URL),
        }
      }
    }
  }}
>
```

**Important notes:**
- `solanaClusters` is DEPRECATED — use `config.solana.rpcs` with `@solana/kit` (already done in our code)
- Privy handles all key management via MPC — we never see private keys
- `useSignAndSendTransaction` returns `{ signature: Uint8Array }` — must convert to base58
- Only email, SMS, and Telegram login work in Telegram's in-app browser — external wallets (MetaMask, Phantom) won't work
- Privy supports **seamless auto-login** in Telegram Mini Apps — calling `loginWithTelegram()` when `tg.initData` exists triggers it

**Logout in Telegram Mini App:**
- `logout()` may trigger OAuth-style redirects that break the Mini App context
- Always call `tg.close()` after logout to avoid "bot domain invalid"

**Server-side auth option (`@privy-io/server-auth` v1.32.x):**
```typescript
import { PrivyClient } from "@privy-io/server-auth";
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

// Verify access token from Authorization: Bearer <token>
const claims = await privy.verifyAuthToken(token);
const user = await privy.getUserById(claims.userId);
const telegramId = user.telegram?.telegramUserId;
```

**Docs:**
- https://docs.privy.io/authentication/user-authentication/login-methods/telegram
- https://docs.privy.io/recipes/react/seamless-telegram
- https://docs.privy.io/guide/server/authorization/verification

### 2. Jupiter Swap API

Jupiter now offers **two APIs**:

| | Ultra API (new) | Metis Swap API (current, still supported) |
|---|---|---|
| Flow | 2 steps: quote + execute (Jupiter sends) | 3 steps: quote + build TX + you send |
| TX Sending | Handled by Jupiter | Developer-managed |
| Slippage | Auto-optimized (RTSE) | Manual |
| Custom Instructions | Not supported | Fully supported |

**SolSwap uses Metis** because we need the raw unsigned TX for Privy's `signAndSendTransaction`.

**Current API:** `https://lite-api.jup.ag/swap/v1` (free tier, rate-limited)
**Paid API:** `https://api.jup.ag` (requires API key from jup.ag/portal)

**Quote endpoint:**
```
GET /swap/v1/quote?inputMint=So11...&outputMint=EPjF...&amount=1000000000
    &platformFeeBps=50&slippageBps=50
```

**Swap endpoint:**
```
POST /swap/v1/swap
{
  "quoteResponse": { /* from /quote */ },
  "userPublicKey": "...",
  "feeAccount": "ATA_ADDRESS_HERE"  // ← Must be ATA, not wallet!
}
```

**Fee collection (CRITICAL — C1):**
- `platformFeeBps=50` in quote request (0.5% fee)
- `feeAccount` in swap request MUST be an Associated Token Account (ATA) for the output mint
- As of January 2025, Jupiter no longer requires the Referral Program — just pass a valid token account
- Derive ATA: `getAssociatedTokenAddress(outputMintPubkey, feeWalletPubkey)` from `@solana/spl-token`
- If you pass a raw wallet address, Jupiter **silently ignores** it — fees are deducted from the quote but never routed to you
- For **ExactIn** swaps: feeAccount mint can be input or output mint
- For **ExactOut** swaps: feeAccount mint can ONLY be input mint

**Fix code:**
```typescript
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

const feeAccount = await getAssociatedTokenAddress(
  new PublicKey(outputMint),       // Token mint
  new PublicKey(FEE_WALLET_ADDRESS) // Fee wallet
);
// Pre-create ATAs for common output mints (SOL, USDC, USDT)
```

**Docs:**
- https://dev.jup.ag/docs/swap/add-fees-to-swap
- https://dev.jup.ag/docs/swap

### 3. Telegram Mini App (WebApp) API

**Current API version:** WebApp 8.0+

**Key APIs:**
```javascript
const tg = window.Telegram.WebApp;
tg.ready();          // Signal bot that app is loaded
tg.expand();         // Expand to full screen
tg.close();          // Close Mini App → back to chat
tg.setHeaderColor("#1a1b2e");
tg.setBackgroundColor("#1a1b2e");

// User identity (UNSAFE — client-side only, can be forged)
tg.initDataUnsafe.user.id;     // Telegram user ID
tg.initDataUnsafe.user.username;

// Signed data (SAFE — for server-side verification)
tg.initData;  // HMAC-signed query string containing user, auth_date, hash
```

**initData format:** URL-encoded query string containing:
- `user` — JSON with `id`, `first_name`, `last_name`, `username`, `language_code`
- `auth_date` — Unix timestamp
- `hash` — HMAC-SHA-256 signature
- `signature` — Ed25519 signature (newer method)
- `query_id`, `chat_instance`, `chat_type`, `start_param`

**Server-side verification with `@telegram-apps/init-data-node`:**
```bash
npm install @telegram-apps/init-data-node
```

```typescript
import { validate, parse } from "@telegram-apps/init-data-node";

function telegramAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const [type, initDataRaw] = authHeader.split(" ");

    if (type !== "tma" || !initDataRaw) {
        return res.status(401).json({ error: "Missing Telegram init data" });
    }

    try {
        validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN!);
        const initData = parse(initDataRaw);
        req.telegramUser = initData.user;
        req.telegramId = initData.user?.id;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid init data" });
    }
}
```

**Client-side — sending initData with every request:**
```typescript
const initDataRaw = window.Telegram.WebApp.initData;
fetch("/api/quote", {
    headers: { "Authorization": `tma ${initDataRaw}` },
});
```

**Manual HMAC verification (alternative to library):**
```typescript
import crypto from "crypto";

function verifyTelegramInitData(initData: string, botToken: string): boolean {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData")
        .update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey)
        .update(dataCheckString).digest("hex");

    return calculatedHash === hash;
}
```

**Pitfalls:**
- Do NOT parse/restructure `initData` before sending — raw query string must be preserved exactly for HMAC
- Default validation window is 24 hours — set custom `expiresIn` for tighter security
- `photo_url` may contain backslashes that break if processed through `JSON.stringify`

**Two auth strategies for SolSwap (pick one):**
1. **Privy server-auth** — verify Privy access token, get telegramId from Privy user object
2. **Telegram initData** — verify HMAC signature, extract user from signed payload (Privy-independent)

**Docs:**
- https://docs.telegram-mini-apps.com/platform/init-data
- https://docs.telegram-mini-apps.com/platform/authorizing-user
- https://docs.telegram-mini-apps.com/packages/telegram-apps-init-data-node
- https://core.telegram.org/bots/webapps

### 4. grammY Bot Framework

**Current version:** v1.40.0 (February 2026). TypeScript-first.

**Usage in project:** Minimal — only `/start` and `/help` commands + Mini App launcher.

**Key patterns:**
```typescript
import { Bot, InlineKeyboard } from "grammy";
const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// InlineKeyboard with WebApp button
const keyboard = new InlineKeyboard().webApp("Open SolSwap", MINIAPP_URL);

// Persistent Menu Button (one-tap access)
await bot.api.setChatMenuButton({
    menu_button: {
        type: "web_app",
        text: "SolSwap",
        web_app: { url: MINIAPP_URL },
    },
});
```

**Error handling fix (M12):**
```typescript
bot.catch((err) => {
    console.error(`Error handling update ${err.ctx.update.update_id}:`);
    console.error("Error:", err.error);  // Full object, not just .message
    console.error("Stack:", err.error instanceof Error ? err.error.stack : "N/A");
});
```

**Docs:** https://grammy.dev/

### 5. LI.FI Cross-Chain API

**Current SDK:** `@lifi/sdk v3.40.x` — v3 introduced providers architecture + Solana support
**REST API:** `https://li.quest/v1` (project uses REST, not SDK)

**v3 SDK config (if upgrading from REST):**
```typescript
import { createConfig, EVM, Solana } from "@lifi/sdk";
createConfig({
    integrator: "SolSwap",
    providers: [
        EVM({ getWalletClient: async () => walletClient }),
        Solana({ getWalletAdapter: async () => walletAdapter }),
    ],
});
```

**REST Quote endpoint:**
```
GET /quote?fromChain=SOL&toChain=ETH&fromToken=So11...112&toToken=0xA0b8...
    &fromAmount=1000000000&fromAddress=...&toAddress=...
```

**Solana support notes:**
- LI.FI uses Jupiter for on-chain Solana swaps
- Cross-chain bridges: Mayan (Wormhole), Allbridge, Circle CCTP
- Solana `transactionRequest.data` is base64-encoded (not hex like EVM)
- Integrator fees require API key from LI.FI partner portal

**Known issues in project:**
- C6: SOL address uses System Program (`111...111`) instead of Wrapped SOL (`So111...112`)
- M9: Response not Zod-validated (violates project pattern)
- M10: No retry wrapper on API calls
- M14: Dummy addresses produce unusable `transactionRequest`
- M15: Arbitrum + Base have zero tokens registered

**Docs:**
- https://docs.li.fi/sdk/overview
- https://docs.li.fi/li.fi-api/solana

### 6. Express.js + Prisma

**Express:** v4.x with TypeScript
**Prisma:** v6.x with SQLite

**Models:** User, Swap, TokenScan, WatchedWallet, Subscription

### Authentication Strategy Decision

Two viable options for fixing C2+C3+C5:

| | Privy Server Auth | Telegram initData |
|---|---|---|
| **Package** | `@privy-io/server-auth` | `@telegram-apps/init-data-node` |
| **How it works** | Verify Privy JWT access token | Verify HMAC-signed Telegram payload |
| **Pros** | Already using Privy; get full user object | No Privy dependency; standard Telegram approach |
| **Cons** | Requires PRIVY_APP_SECRET env var | Only works in Telegram context |
| **Header** | `Authorization: Bearer <privy-token>` | `Authorization: tma <initData>` |

**Recommendation:** Use **Privy server-auth** since SolSwap is already Privy-based. Add Telegram `initData` as a fallback for endpoints that don't require Privy auth.

---

## Priority Fix Order (What to Do Next)

### Immediate (Do Now)
1. **Fix graceful logout** — prevent "bot domain invalid" error
2. **Redeploy VPS** — so the new quote/swap endpoints work
3. **Verify Vercel env vars** — ensure `VITE_API_URL` and `VITE_PRIVY_APP_ID` are set

### Before Real Money
4. **C1: Fix fee collection** — derive ATA for feeAccount in `jupiter/swap.ts`
5. **C2+C5: Add initData auth** — verify Telegram HMAC server-side
6. **C4: Lock CORS** — set to Vercel domain only in production
7. **H1: Validate quote server-side** — prevent fee bypass

### Before Beta Users
8. **H5: BigInt arithmetic** — prevent precision loss on token amounts
9. **H6+H7: Upsert + try/catch** in startCommand
10. **H8+H9: Input validation** on quote parameters
11. **M1+M2: Rate limiting + helmet** on API
12. **M8: Record swaps** in DB after execution

### Phase 2 (Mini App UI)
13. Tab navigation (Swap / Scan / Track / Signals)
14. ScanPanel component
15. WalletHeader component
16. TokenSelector improvements

---

## Files That Will Be Modified

| File | Changes |
|------|---------|
| `webapp/src/App.tsx` | Graceful logout, quote param validation |
| `webapp/src/lib/api.ts` | Add param validation before API calls |
| `src/jupiter/swap.ts` | Fix feeAccount (ATA derivation) — C1 |
| `src/api/server.ts` | Add initData auth middleware — C2 |
| `src/api/routes/user.ts` | Verify wallet ownership — C3 |
| `src/config.ts` | Reject CORS wildcard in production — C4 |
| `src/aggregator/chains.ts` | Fix SOL address — C6 |

---

## Deployment Checklist

- [ ] Fix graceful logout in App.tsx
- [ ] Merge branch to main (or deploy branch directly)
- [ ] Verify Vercel auto-deploys frontend
- [ ] SSH to VPS and redeploy backend
- [ ] Test full swap flow: /start → Mini App → login → select tokens → enter amount → quote → swap
- [ ] Verify Solscan link works after swap
- [ ] Verify history panel shows swaps
- [ ] Test logout → close → reopen → re-login flow
