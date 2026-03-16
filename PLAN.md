# SolSwap — Bug Fix Plan (Critical & Medium)

> Updated: 2026-03-16 | Pre-production bug quashing sprint
> Branch: `claude/codebase-review-audit-xeqkA`
> Previous plan content archived — see git history for UI/UX and referral plans.

---

## Overview

6 bugs identified in final audit. Execution order: lowest risk first, highest complexity last.

| # | Severity | Bug | File(s) | Effort |
|---|----------|-----|---------|--------|
| 1 | MEDIUM | express-rate-limit IPv6 bypass (CVE-2026-30827) | `package.json` | 2 min |
| 2 | HIGH | LI.FI token cache retry storm | `src/aggregator/lifiTokens.ts` | 5 min |
| 3 | MEDIUM | Duplicate swap/transfer records on retry | `src/api/routes/swap.ts`, `transfer.ts` | 15 min |
| 4 | MEDIUM | Tracker wallet limit race condition | `src/api/routes/tracker.ts` | 15 min |
| 5 | HIGH | Whale tracker false alerts after restart | `src/tracker/monitor.ts` | 20 min |
| 6 | MEDIUM | SPL token amount miscalculation in whale alerts | `src/tracker/monitor.ts` | 30 min |

---

## Bug 1: express-rate-limit IPv6 Bypass [MEDIUM]

**CVE-2026-30827** (CVSS 7.5) — On dual-stack servers, the default `keyGenerator` applies a `/56` IPv6 subnet mask to IPv4-mapped addresses (`::ffff:x.x.x.x`). All IPv4 clients share one rate-limit bucket. One attacker can trigger 429 for all IPv4 users.

**Current:** `"express-rate-limit": "^8.2.1"` — version 8.2.1 is affected.

**Fix:** Upgrade to 8.3.1. No code changes. The fix corrects the default `keyGenerator` to handle IPv4-mapped addresses.

```bash
npm install express-rate-limit@8.3.1
```

**Verify:** `npm audit` should show 0 high-severity issues for express-rate-limit. Rate limiting still works (send 101 rapid requests → 429 on 101st).

---

## Bug 2: LI.FI Token Cache Retry Storm [HIGH]

**File:** `src/aggregator/lifiTokens.ts`, lines 99-103

**Problem:** When all 6 chain fetches fail (`newTokens.size === 0`), `cache.lastFetch` is never updated. Since `Date.now() - 0 > CACHE_TTL_MS` is always true, every single API request triggers a new `refreshCache()` call — effectively DDoS-ing LI.FI and degrading our own response times.

**Fix:** Always update `cache.lastFetch` after a refresh attempt, even on failure.

```typescript
// CURRENT (line 99-103):
if (newTokens.size > 0) {
    cache = { tokens: newTokens, lastFetch: Date.now() };
    const total = ...;
    console.log(...);
}

// FIXED:
if (newTokens.size > 0) {
    cache = { tokens: newTokens, lastFetch: Date.now() };
    const total = Array.from(newTokens.values()).reduce((sum, t) => sum + t.length, 0);
    console.log(`LI.FI token cache refreshed: ${total} tokens across ${newTokens.size} chains`);
} else {
    cache = { ...cache, lastFetch: Date.now() };
    console.warn("LI.FI token cache refresh returned 0 tokens (will retry in 30 min)");
}
```

**Verify:** Temporarily block LI.FI (or disconnect network). Logs should show ONE "0 tokens" warning per 30 min, not per request. Hardcoded tokens still served as fallback.

---

## Bug 3: Duplicate Swap/Transfer Records [MEDIUM]

**Files:** `src/api/routes/swap.ts` (POST /swap/confirm), `src/api/routes/transfer.ts` (POST /transfer/confirm)

**Problem:** No deduplication on `txSignature`. If the client retries the confirm call (network timeout, user double-tap), duplicate records are created. The existing `@@index([txSignature])` helps lookups but doesn't enforce uniqueness.

**Why not `@unique` on schema?** `txSignature` is nullable on Swap (starts null for PENDING). While SQLite treats multiple NULLs as distinct (which is correct), adding `@unique` would require a migration and is fragile if we switch to Postgres. Idempotent API design is cleaner.

**Fix — swap.ts** (add before `prisma.swap.create` at line 84):

```typescript
// Idempotent: if this tx was already confirmed, return existing record
if (txSignature) {
    const existing = await prisma.swap.findFirst({
        where: { txSignature, userId: user.id },
        select: { id: true, status: true },
    });
    if (existing) {
        res.json({ swapId: existing.id, status: existing.status });
        return;
    }
}
```

**Fix — transfer.ts** (add before `prisma.transfer.create` at line 40):

```typescript
// Idempotent: if this tx was already recorded, return existing record
const existing = await prisma.transfer.findFirst({
    where: { txSignature: parsed.data.txSignature, userId: user.id },
    select: { id: true, status: true },
});
if (existing) {
    res.json({ transferId: existing.id, status: existing.status });
    return;
}
```

**Verify:** Call `POST /api/swap/confirm` twice with the same body. Second response should return the existing record (same swapId), not create a duplicate. Check DB: `SELECT COUNT(*) FROM Swap WHERE txSignature = '...'` should be 1.

---

## Bug 4: Tracker Wallet Limit Race Condition [MEDIUM]

**File:** `src/api/routes/tracker.ts`, lines 78-96

**Problem:** Count check (line 81-83) and upsert (line 99) are separate queries. Two concurrent requests can both pass the limit check and exceed the cap.

**Research confirms:** Prisma interactive `$transaction` works on SQLite with Serializable isolation. The count-then-upsert becomes effectively atomic.

**Fix:** Wrap the count check + upsert in a `$transaction`:

```typescript
// CURRENT:
const existingCount = await prisma.watchedWallet.count({...});
if (existingCount >= limit) { ... return; }
const watched = await prisma.watchedWallet.upsert({...});

// FIXED:
const result = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.watchedWallet.count({
        where: { userId: user.id, active: true },
    });
    if (existingCount >= limit) {
        return { error: true as const, count: existingCount };
    }
    const watched = await tx.watchedWallet.upsert({
        where: { userId_walletAddress: { userId: user.id, walletAddress } },
        update: { active: true, label: label ?? undefined },
        create: { userId: user.id, walletAddress, label: label ?? null, chain },
    });
    return { error: false as const, watched };
});

if (result.error) {
    res.status(403).json({
        error: limit === WALLET_LIMITS.free
            ? `Free tier: max ${WALLET_LIMITS.free} watched wallets...`
            : `Limit reached...`,
        currentCount: result.count,
        limit: limit === Infinity ? null : limit,
    });
    return;
}
// Use result.watched for the response
```

**Important:** Keep the `$transaction` short — no RPC calls inside it. The webhook registration (`addAddressToWebhook`) stays OUTSIDE the transaction (after the response).

**Verify:** At limit=3 with 2 existing wallets, fire 2 concurrent watch requests. Only 1 should succeed (total = 3). The other should get 403.

---

## Bug 5: Whale Tracker False Alerts After Restart [HIGH]

**File:** `src/tracker/monitor.ts`

**Problem:** `lastSeenSignatures` is in-memory. On restart:
1. First poll sets baseline (stores latest signature, no alerts) — correct
2. But if the wallet had no activity during downtime, the baseline is stale
3. When activity finally resumes (could be days later), all transactions since last baseline appear "new"
4. More critically: if a transaction's `blockTime` is old (before the restart), it still triggers an alert

**Fix:** Store timestamp alongside signature. Filter out transactions older than 5 minutes to prevent stale alerts.

```typescript
// CURRENT:
const lastSeenSignatures = new Map<string, string>();

// FIXED:
interface WalletBaseline {
    signature: string;
    timestamp: number; // Date.now() when baseline was set
}
const lastSeenData = new Map<string, WalletBaseline>();

// In processWallet:
const lastSeen = lastSeenData.get(wallet.walletAddress);
// ... fetch signatures ...
lastSeenData.set(wallet.walletAddress, {
    signature: signatures[0].signature,
    timestamp: Date.now(),
});
if (!lastSeen) return; // First poll — baseline only

// Filter: skip transactions older than 5 minutes
const MAX_ALERT_AGE_S = 300; // 5 minutes
const now = Math.floor(Date.now() / 1000);
for (const sig of signatures) {
    if (sig.blockTime && (now - sig.blockTime) > MAX_ALERT_AGE_S) {
        continue; // Skip old transactions
    }
    await checkTransaction(wallet, sig.signature);
}
```

**Also fix:** Add error logging in the catch block (line 90-92) — currently empty `catch (err) {}` silently swallows all errors including invalid wallet addresses and RPC rate limiting.

```typescript
// CURRENT (line 90-92):
} catch (err) {
    // Silently skip
}

// FIXED:
} catch (err) {
    console.warn(`Whale tracker: failed to process ${wallet.walletAddress}:`,
        err instanceof Error ? err.message : err);
}
```

**Verify:** Restart the process. Within 30s, no false alerts should fire. Then send a real 10+ SOL transaction to a watched wallet and confirm the alert fires within 60s.

---

## Bug 6: SPL Token Amount Miscalculation in Whale Alerts [MEDIUM]

**File:** `src/tracker/monitor.ts`, lines 141-163

**Problem:** Line 148: `Number(info.lamports ?? info.amount ?? 0) / 1e9` divides ALL amounts by 1e9 (9 decimals). For SPL tokens:
- USDC (6 decimals): 1,000,000 raw ÷ 1e9 = 0.001 (shows 1000x too small)
- BONK (5 decimals): 100,000 raw ÷ 1e9 = 0.0001 (shows 10000x too small)

**Research confirms:** `getParsedTransaction` includes `meta.postTokenBalances` with mint, decimals, and `uiTokenAmount` for each token account. For `transferChecked` instructions, decimals are inline. For plain `transfer`, we need `postTokenBalances`.

**Fix approach — use `postTokenBalances` + price lookup for USD value:**

Since the whale tracker's alert threshold is about VALUE (>= 10 SOL worth), the cleanest fix is:

1. For native SOL balance changes (already handled at lines 119-138) — keep as-is (lamports / 1e9 is correct)
2. For SPL token transfers (lines 141-163) — use `postTokenBalances` to get the mint + uiAmount, then look up USD price to check against threshold

```typescript
// Replace the inner instruction parsing (lines 141-163) with:
// Check postTokenBalances for significant token movements
if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
    const pre = tx.meta.preTokenBalances;
    const post = tx.meta.postTokenBalances;

    // Build map: accountIndex → { mint, preAmount, postAmount }
    for (const postBal of post) {
        const owner = postBal.owner;
        if (owner !== wallet.walletAddress) continue;

        const preBal = pre.find(p => p.accountIndex === postBal.accountIndex);
        const preUiAmount = preBal?.uiTokenAmount?.uiAmount ?? 0;
        const postUiAmount = postBal.uiTokenAmount?.uiAmount ?? 0;
        const changeAmount = Math.abs(postUiAmount - preUiAmount);

        if (changeAmount === 0) continue;

        const mint = postBal.mint;
        // Look up USD price
        const prices = await getTokenPricesBatch([mint]);
        const priceUsd = prices[mint]?.priceUsd ?? 0;
        const valueUsd = changeAmount * priceUsd;

        // Alert if value >= MIN_SOL_ALERT * SOL price (roughly $10+ SOL equivalent)
        // Or simpler: alert if value >= $150 (approximate 10 SOL)
        const MIN_USD_ALERT = 150;
        if (valueUsd >= MIN_USD_ALERT) {
            const direction = postUiAmount > preUiAmount ? "received" : "sent";
            const symbol = postBal.uiTokenAmount?.uiAmountString
                ? `${changeAmount.toFixed(2)} tokens`
                : `${changeAmount}`;
            const alert = formatAlert({
                walletAddress: wallet.walletAddress,
                label: wallet.label,
                direction,
                amount: changeAmount,
                symbol: mint.slice(0, 6), // TODO: look up symbol from Jupiter cache
                valueUsd,
                signature,
            });
            await sendTelegramAlert(wallet.user.telegramId, alert);
        }
    }
}
```

**Note:** `formatAlert` may need updating to accept `symbol` and `valueUsd` params. Also need to import `getTokenPricesBatch` from `jupiter/price.ts`.

**Verify:** Watch a wallet, send 200 USDC to it. Alert should show correct amount (~$200 USD), not the current miscalculated value.

---

## Post-Fix: Documentation Updates

After all bugs are fixed, update:

1. **CLAUDE.md — Known Issues table:** Mark all 6 bugs as FIXED with version tag
2. **CLAUDE.md — Changelog:** Add new entry for this session
3. **CLAUDE.md — Production Readiness:** Update score from 82 to ~90
4. **PLAN.md:** Archive this plan, note completion

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `package.json` | Upgrade express-rate-limit to 8.3.1 |
| `src/aggregator/lifiTokens.ts` | Cache retry storm fix (3 lines) |
| `src/api/routes/swap.ts` | txSignature dedup check (8 lines) |
| `src/api/routes/transfer.ts` | txSignature dedup check (7 lines) |
| `src/api/routes/tracker.ts` | Wrap count+upsert in $transaction (~20 lines changed) |
| `src/tracker/monitor.ts` | Baseline timestamps, blockTime filter, SPL decimals fix (~60 lines) |
| `CLAUDE.md` | Known Issues, Changelog, Production Readiness |
