# Fix Plan: Swap This Token + Stuck Pending Transactions

## Problem 1: "Swap This Token" from Scanner doesn't work

### Root Cause
`ScanPanel` passes only a mint address string to `App.tsx`, which passes it to `SwapPanel` as `initialOutputMint`. SwapPanel then calls `searchTokens(mint)` which hits `GET /api/tokens/search`. That endpoint searches **only** the Jupiter verified token list.

The scanner is designed for **memecoins and unknown tokens** — exactly the tokens that are NOT on Jupiter's verified list. So `searchTokens()` returns `[]`, no match is found, `setOutputToken()` is never called, and the user silently lands on default SOL→USDC.

### Fix
**Pass full token info from ScanPanel, not just the mint.** The scan result already has `name`, `symbol`, `decimals`, `icon`, and `mint`. We can construct a `TokenInfo` directly.

#### Changes:

**1. `ScanPanel.tsx`** — Change callback to pass token info object
- `onNavigateToSwap` signature: `(mint?: string)` → `(token?: { mint: string; symbol: string; name: string; decimals: number; icon: string })`
- Build token from `result.tokenInfo` + `result.mintAddress`

**2. `App.tsx`** — Store full token info instead of just mint string
- `pendingSwapMint: string | null` → `pendingSwapToken: TokenInfo | null`
- Pass `initialOutputToken` to SwapPanel instead of `initialOutputMint`

**3. `SwapPanel.tsx`** — Accept full token info, use directly
- Prop: `initialOutputMint?: string | null` → `initialOutputToken?: TokenInfo | null`
- The useEffect no longer needs to call `searchTokens()` — just set the token directly
- Still check for same-token-both-sides
- Show toast on successful pre-selection

**4. `api.ts`** — No changes needed (TokenInfo interface already has all fields)

### No VPS redeployment needed — frontend-only changes (Vercel auto-deploys)

---

## Problem 2: Stuck pending transaction

### How it works currently
1. User signs swap → frontend calls `POST /api/swap/confirm` → creates Swap with status `SUBMITTED`
2. Backend `pollTransactionInBackground()` polls on-chain status: 100 attempts × 3 seconds = ~5 min
3. If confirmed → `CONFIRMED`. If tx error → `FAILED`. If 100 polls exhausted → `TIMEOUT`
4. Frontend polls `GET /api/swap/status` every 3s for up to 40 attempts (~2 min)
5. If frontend poll hits 40 attempts, it shows "done" regardless and stops polling

### Why transactions get stuck on PENDING/SUBMITTED
- The Swap record is created with status `SUBMITTED` when `POST /api/swap/confirm` is called
- If the VPS restarts (PM2 restart, deploy) while `pollTransactionInBackground()` is running, the polling coroutine dies — the swap stays `SUBMITTED` forever
- If Solana RPC is temporarily unreachable during all 100 poll attempts, it marks as `TIMEOUT`
- If the user's Privy signing fails but the frontend still calls confirm (unlikely but possible), the tx was never broadcast

### What the user sees
- In TransactionsTab: swap shows with ⏳ status. Tapping it opens the detail modal.
- If `txSignature` exists: Solscan link IS shown (already implemented)
- If `txSignature` is null: no link available (tx was never broadcast)

### Fix: Add a "re-check" mechanism for stuck transactions
Since the backend already has `pollTransactionStatus()`, we can add a way to re-trigger it.

#### Changes:

**1. `src/api/routes/swap.ts`** — Add `POST /api/swap/recheck`
- Takes `{ swapId }`, looks up the swap for the authenticated user
- Only works on `SUBMITTED` or `TIMEOUT` status (not CONFIRMED/FAILED)
- Re-checks the on-chain status once (single getSignatureStatus call)
- Returns the updated status
- If no txSignature, marks as FAILED (tx was never broadcast)

**2. `webapp/src/lib/api.ts`** — Add `recheckSwap()` function

**3. `webapp/src/components/TransactionsTab.tsx`** — Add "Re-check" button in detail modal
- Shown only for `SUBMITTED`, `PENDING`, or `TIMEOUT` status swaps
- Calls `recheckSwap()`, shows loading spinner, updates status on completion
- If tx is confirmed on-chain, status updates to CONFIRMED
- If tx doesn't exist on-chain, status updates to FAILED with explanation

### VPS redeployment needed — new API endpoint. No Prisma/DB changes.

---

## Summary of file changes

| File | Change | Deploy |
|------|--------|--------|
| `webapp/src/components/ScanPanel.tsx` | Pass full token info in callback | Vercel |
| `webapp/src/App.tsx` | Store `pendingSwapToken` (full object) instead of `pendingSwapMint` | Vercel |
| `webapp/src/components/SwapPanel.tsx` | Accept `initialOutputToken` prop, use directly | Vercel |
| `src/api/routes/swap.ts` | Add `POST /api/swap/recheck` endpoint | VPS |
| `webapp/src/lib/api.ts` | Add `recheckSwap()` function | Vercel |
| `webapp/src/components/TransactionsTab.tsx` | Add re-check button for stuck txs | Vercel |
| `CLAUDE.md` | Update docs + changelog | Git |

**VPS redeployment: YES** (new swap/recheck endpoint). No Prisma/DB changes needed.
