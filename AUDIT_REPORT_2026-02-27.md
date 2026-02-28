# SolSwap Pre-Launch Audit Report

Generated: 2026-02-27
Audited by: Claude Opus 4.6
Codebase version: v0.5.2

## Executive Summary

SolSwap is a well-engineered, non-custodial Telegram Mini App with strong security foundations. All 7 previously-identified CRITICAL security issues have been properly fixed. The Telegram initData HMAC authentication is correctly implemented with timing-safe comparison, the fee bypass prevention is robust, and the non-custodial transaction model is sound — private keys never touch the server. The main gaps are in authorization granularity (swap status endpoint lacks ownership check), input validation edge cases (BigInt crash vector), missing GDPR data deletion capability, and the absence of CI/CD. The codebase is ready for a controlled soft beta with real money, but the HIGH findings below should be addressed before a broader public launch.

## Production Readiness Score: 82/100

### Score Breakdown

| Category | Score | Max | Notes |
|----------|-------|-----|-------|
| Backend API Logic | 12 | 15 | -2 swap/status ownership, -1 input validation gaps |
| Authentication & Security | 20 | 20 | Telegram HMAC flawless, timing-safe, expiry enforced |
| Fee Collection & Revenue | 9 | 10 | -1 cross-chain fees not enforced (documented) |
| Solana Transaction Safety | 10 | 10 | Non-custodial model correct, polling robust |
| Database Layer | 7 | 8 | -1 BigInt→Number precision loss in quote display |
| Token Scanner | 4.5 | 5 | -0.5 documented AGE-1 bug (low impact) |
| Cross-Chain Integration | 5 | 5 | Zod validation, retry, consistent chains |
| Frontend Logic & UX | 9.5 | 10 | -0.5 weak client-side address validation in SendFlow |
| Privacy & Data Minimization | 2 | 7 | -5 no data deletion endpoint (GDPR gap) |
| Infrastructure & Deployment | 7 | 7 | PM2, graceful shutdown, env validation all correct |
| Test Coverage | 2 | 3 | -1 no CI/CD, no E2E Privy signing tests |
| Deductions for findings | -6 | 0 | 1 HIGH (-5) + 2 MEDIUM (-2) below threshold |
| **TOTAL** | **82** | **100** | |

---

## Findings

### CRITICAL (must fix before any real money)

**None found.** All previously-documented CRITICAL issues have been properly fixed.

---

### HIGH (should fix before public launch)

**H1: `/api/swap/status` — Missing User Ownership Check**
- **Area:** Backend API Logic (Area 1)
- **File:** `src/api/routes/swap.ts:103-131`
- **Description:** The `/api/swap/status?swapId=<ID>` endpoint is protected by auth middleware but does NOT verify that the queried swap belongs to the authenticated user. Any authenticated user can look up the status of ANY other user's swap by guessing the CUID.
- **Impact:** Information disclosure — attacker with valid auth token could enumerate swap statuses (CUID complexity provides some protection, but this violates least-privilege). Reveals txSignature, status, and swap existence.
- **Fix:**
  ```typescript
  const telegramId = res.locals.telegramId as string;
  const user = await findUserByTelegramId(telegramId);
  if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
  }
  const swap = await prisma.swap.findFirst({
      where: { id: swapId, userId: user.id },
      select: { id: true, status: true, txSignature: true },
  });
  ```

**H2: `/api/swap/confirm` — BigInt Crash on Malformed Input**
- **Area:** Backend API Logic (Area 1)
- **File:** `src/api/routes/swap.ts:79-80`
- **Description:** `inputAmount` and `outputAmount` from the request body are passed directly to `BigInt()` without format validation. If a client sends `"-1000"`, `"abc"`, `"1.5"`, or an extremely long string, `BigInt()` throws, resulting in a caught 500 error. While the try/catch prevents a crash, this should be a 400 validation error.
- **Impact:** Attacker can trigger repeated 500 errors with malformed input. Not a security vulnerability per se (auth required, try/catch catches it), but bad input should return 400, not 500.
- **Fix:**
  ```typescript
  if (!/^(0|[1-9]\d*)$/.test(String(inputAmount)) || !/^(0|[1-9]\d*)$/.test(String(outputAmount))) {
      res.status(400).json({ error: "Invalid amount: must be a non-negative integer string" });
      return;
  }
  ```

**H3: No GDPR Data Deletion Endpoint**
- **Area:** Privacy & Data Minimization (Area 9)
- **File:** No file (missing feature)
- **Description:** No `DELETE /api/user` or equivalent endpoint exists. Users cannot request deletion of their data (Telegram ID, wallet address, swap history, transfer history including recipient addresses, scan history). This violates GDPR Article 17 "Right to be Forgotten" and similar privacy regulations.
- **Impact:** Legal/compliance risk. Transaction records (including recipient addresses) persist indefinitely with no purge mechanism.
- **Fix:** Implement `DELETE /api/user` that cascades deletion of all user-owned records (Swap, Transfer, TokenScan, WatchedWallet, Subscription). Consider soft-delete with 30-day retention before hard purge.

---

### MEDIUM (fix before scaling)

**M1: `/api/price/:mint` — Weak Mint Address Validation**
- **Area:** Backend API Logic (Area 1)
- **File:** `src/api/routes/price.ts:14`
- **Description:** Validates only `mint.length < 32` instead of using `isValidPublicKey(mint)`. Allows invalid but long-enough strings through, which fail downstream at Jupiter API.
- **Impact:** Returns 500 instead of 400 for invalid mints. Not a security issue (public endpoint), but degrades reliability.
- **Fix:** Replace with `if (!mint || !isValidPublicKey(mint))`.

**M2: `/api/cross-chain/quote` — Missing SlippageBps Validation**
- **Area:** Cross-Chain Integration (Area 7)
- **File:** `src/api/routes/crossChain.ts:37`
- **Description:** The `slippageBps` query param is passed to `getSmartQuote()` without range validation. The same-chain `/api/quote` endpoint validates 0-5000, but cross-chain does not.
- **Impact:** Extreme slippage values could be sent to LI.FI, causing confusing quotes.
- **Fix:** Add bounds check matching the same-chain quote endpoint.

**M3: Quote Display — BigInt-to-Number Precision Loss**
- **Area:** Database Layer (Area 5)
- **File:** `src/api/routes/quote.ts:89`
- **Description:** `Number(quote.outAmount)` converts a potentially large BigInt string to JavaScript Number, which loses precision for values above 2^53 (9,007,199,254,740,992). While uncommon for most tokens, high-supply low-decimal tokens could trigger this.
- **Impact:** Incorrect USD display values for extremely large token amounts. Not a fund safety issue (actual swap uses the raw quote), but misleading UI.
- **Fix:** Use BigInt division for the integer part and modular arithmetic for the fractional part.

**M4: `/api/user/balances` — Queries Any Wallet Address**
- **Area:** Privacy (Area 9)
- **File:** `src/api/routes/user.ts:109-159`
- **Description:** The endpoint is auth-protected but allows querying ANY wallet address via `?walletAddress=` param, not just the authenticated user's wallet. While blockchain data is public, this makes SolSwap a convenient wallet-tracking tool.
- **Impact:** Privacy concern — authenticated users can enumerate any wallet's balances through SolSwap's API. Low practical risk since data is publicly available on-chain.
- **Fix (optional):** Restrict to user's own wallet only: `if (walletAddress !== user.walletAddress) return 403`.

**M5: Database Not Encrypted at Rest**
- **Area:** Privacy (Area 9)
- **File:** SQLite database file
- **Description:** The SQLite database containing Telegram IDs, wallet addresses, and transaction history is stored as a plain file on the VPS with no encryption at rest. If the VPS is compromised, all data is immediately accessible.
- **Impact:** Single point of failure for all user PII. Links Telegram identities to wallet addresses and transaction history.
- **Fix:** Use SQLCipher for SQLite encryption at rest, or implement filesystem-level encryption.

---

### LOW (fix in Phase 3)

**L1: Token Age Bug (AGE-1) — Confirmed as Documented**
- **Area:** Token Scanner (Area 6)
- **File:** `src/scanner/checks.ts:261-314`
- **Description:** `checkTokenAge` walks backwards through signature history in pages of 1,000 (up to 5 pages). For tokens with >5,000 total transactions, the function finds the blockTime of the 5,000th-most-recent tx, not the first-ever tx. Popular tokens can appear "brand new."
- **Impact:** Only affects the 10-point Token Age check. Popular tokens score LOW risk anyway via other checks (Jupiter verified, metadata present).
- **Fix:** Add early-exit if `ageDays >= 30` on any page — no need to keep paging.

**L2: `/api/transactions` — Silent Passthrough for Unknown Preset Values**
- **Area:** Backend API Logic (Area 1)
- **File:** `src/api/routes/transactions.ts:48-71`
- **Description:** If `preset` is an unknown value (not "today", "7d", "30d"), the endpoint silently returns all transactions without date filtering, instead of rejecting the request.
- **Impact:** User can bypass date filtering by sending `?preset=invalid`. Not a security issue (user-owned data, auth required), but unexpected API behavior.
- **Fix:** Return 400 for unknown preset values.

**L3: `asyncHandler` Wrapper Defined But Not Used**
- **Area:** Code Quality (Area 12)
- **File:** `src/api/server.ts:13-19`
- **Description:** The `asyncHandler` helper is defined and exported but all route handlers use inline try/catch instead. This is a consistency issue, not a bug — both approaches are safe.
- **Impact:** None (code correctness is unaffected).

**L4: Console Logging Instead of Structured Logging**
- **Area:** Infrastructure (Area 10)
- **File:** All source files (~45 console.log/error/warn calls)
- **Description:** All logging uses `console.log/error/warn` instead of a structured logging library (e.g., pino, winston). PM2 captures stdout/stderr, but there's no JSON format, log levels, or log aggregation support.
- **Impact:** Makes production debugging harder at scale. Sufficient for soft beta.
- **Fix:** Adopt a structured logging library before scaling past 500 users.

**L5: No CI/CD Pipeline**
- **Area:** Test Coverage (Area 11)
- **File:** No `.github/workflows/` directory exists
- **Description:** No GitHub Actions or CI/CD pipeline. Tests must be run manually.
- **Impact:** Risk of deploying breaking changes without running tests.
- **Fix:** Add GitHub Actions workflow: lint → test → build on every PR.

**L6: `DATABASE_URL` Uses Relative Path**
- **Area:** Infrastructure (Area 10)
- **File:** `src/config.ts:49`
- **Description:** Default is `file:./dev.db` (relative). If PM2 changes cwd (unlikely but possible), the database could be created in the wrong location.
- **Impact:** Very low risk with current PM2 config, but absolute path is more explicit.
- **Fix:** Set `DATABASE_URL=file:/home/user/solswapbot/prod.db` in production `.env`.

**L7: Client-Side Recipient Address Validation — Length Only**
- **Area:** Frontend (Area 8)
- **File:** `webapp/src/components/SendFlow.tsx`
- **Description:** The frontend validates recipient addresses with a simple length check rather than full ed25519 validation. Backend correctly validates with `isValidSolanaAddress()`, so invalid addresses are still rejected.
- **Impact:** UX issue — user gets a server error instead of immediate client-side feedback for invalid addresses.
- **Fix:** Use `@solana/kit` equivalent of address validation on the client.

---

### INFORMATIONAL (no score impact)

**I1: Auth Middleware — Correctly Implements Telegram Spec**
- All 6 verification steps match the Telegram documentation exactly:
  - `HMAC-SHA256("WebAppData", bot_token)` for key derivation (`telegramAuth.ts:61-64`)
  - Fields sorted lexicographically, `hash` excluded (`telegramAuth.ts:54-58`)
  - `crypto.timingSafeEqual` used for constant-time comparison (`telegramAuth.ts:73`)
  - `auth_date` checked with NaN guard and 1-hour TTL (`telegramAuth.ts:85-91`)
  - User field extracted from verified payload, never from client body (`telegramAuth.ts:94-106`)
  - Fails closed on all error paths (every branch returns 401)

**I2: All Protected Routes Have Auth Middleware**
- Verified in `server.ts:78-86`: All 9 route groups (quote, swap, user, scan, crossChain, history, send, transfer, transactions) are mounted with `telegramAuthMiddleware`.
- All 4 public routes (health, price, tokens, tokens/search) are correctly unprotected.

**I3: Fee Collection Architecture Is Correct**
- `platformFeeBps=50` validated server-side before building tx (`swap.ts:28`)
- Fee account derived via `getAssociatedTokenAddressSync(outputMint, feeWallet, true)` (`jupiter/swap.ts:27-28`)
- `FEE_WALLET_ADDRESS` validated as ed25519 public key via Zod on startup (`config.ts:11-17`)
- Unit tests cover fee bypass scenarios (5 tests in `smoke.test.ts:118-144`)

**I4: Non-Custodial Model Verified**
- No `Keypair`, `sign()`, or private key handling anywhere in backend code
- Server builds unsigned transactions only
- Privy SDK signs exclusively in the browser
- `pollTransactionInBackground()` only reads on-chain state, never submits

**I5: Scanner RPC Optimizations Work as Documented**
- `accountInfo` fetched once, shared by `checkMintAuthority` + `checkFreezeAuthority` (`analyze.ts:68-69, 77-78`)
- `supplyInfo` fetched once, shared with `checkTopHolders` (`analyze.ts:70, 79`)
- `tokenMeta` fetched once from Jupiter cache, shared by `checkJupiterVerified` + `checkHasMetadata` (`analyze.ts:72, 84-85`)
- All async checks run via `Promise.all()` (`analyze.ts:76-81`)

**I6: Risk Score Weights Match Documentation**
- Mint Authority: 30 (`checks.ts:62`) ✓
- Freeze Authority: 20 (`checks.ts:112`) ✓
- Top Holders: 20 (`checks.ts:20`) ✓ (threshold: >50% concentration)
- Token Metadata: 15 (`checks.ts:252`) ✓
- Jupiter Verified: 10 (`checks.ts:227`) ✓
- Token Age: 10 (`checks.ts:312`) ✓
- Max: 105, clamped to 100 (`analyze.ts:96`) ✓

**I7: Errored Check Exclusion Works Correctly**
- All check functions return `{ errored: true, safe: true }` on network failures
- `analyzeToken()` skips errored checks: `if (check.errored) return score;` (`analyze.ts:91`)
- Network flakiness cannot inflate risk scores ✓

**I8: TypeScript Strict Mode Enabled**
- `tsconfig.json` has `"strict": true` — enables `strictNullChecks`, `noImplicitAny`, etc.
- Only 5 justified `any` uses across the codebase (LI.FI response, SPL token parsing, Express internals, error objects)

**I9: Rate Limiting Configured**
- 100 requests/minute per IP globally (`server.ts:59-66`)
- Standard headers enabled, legacy disabled
- Appropriate for a trading app with expected 50-100 users

**I10: Graceful Shutdown Implemented**
- `app.ts:39-55` handles SIGINT + SIGTERM
- Stops bot, closes HTTP server (waits for in-flight), disconnects Prisma
- PM2 `kill_timeout: 10000` allows 10 seconds for cleanup

**I11: No SQL Injection Vectors**
- Zero instances of `prisma.$queryRaw` or `prisma.$executeRaw` in the codebase
- All queries use Prisma's type-safe query builder

**I12: `.gitignore` Properly Configured**
- `.env` excluded ✓
- `*.db` and `*.db-journal` excluded ✓
- `node_modules/` and `dist/` excluded ✓

**I13: Scan Persistence — Graceful Failure**
- Scan results always returned to user even if DB write fails (`scan.ts:28-54`)
- DB failure logged but does not affect user experience ✓

**I14: Unit Test Suite — 23 Tests, Correctly Implemented**
- Telegram HMAC auth: 6 tests (hash determinism, tamper detection, param order invariance)
- Auth expiry/replay: 5 tests (old timestamps rejected, NaN handling, boundary cases)
- Fee bypass: 5 tests (correct feeBps accepted, 0/1/100/undefined rejected)
- Address validation: 7 tests (valid/invalid SOL addresses, EVM rejection, whitespace)
- Tests exercise the actual auth algorithm, not just mocks — they would fail if implementation changed

**I15: Integration Tests — 13 Tests via Shell Script**
- Public routes: health, price, tokens, token search
- Auth rejection on all protected routes (7 routes tested)
- Fee bypass rejection

**I16: localStorage Keys Properly Namespaced**
- `solswap_slippage_bps`, `solswap_recent_tokens`, `solswap_recent_scans`, `solswap_terms_accepted`
- All use `solswap_` prefix — no collision with Privy storage ✓

**I17: Cross-Chain Fee Status — Correctly Documented**
- LI.FI integrator tag sent only if `LIFI_API_KEY` is set (`lifi.ts:132-136`)
- No `platformFeeBps` incorrectly passed to LI.FI
- CLAUDE.md correctly notes this is "not yet live" ✓

**I18: Bot Logger — Minimal and Safe**
- `logger.ts` logs only: timestamp, user ID, command name, response time
- No message content, wallet addresses, amounts, or initData logged ✓

---

## Top 5 Fixes For Immediate Impact

1. **H1: Add user ownership check to `/api/swap/status`** — Prevents cross-user information disclosure. ~5 minutes to fix.

2. **H2: Validate BigInt inputs in `/api/swap/confirm`** — Prevents malformed input from causing 500 errors. Add regex check before `BigInt()`. ~5 minutes to fix.

3. **H3: Implement `DELETE /api/user` for GDPR compliance** — Required for legal compliance. Cascade-delete all user records. ~30 minutes to implement.

4. **M1: Strengthen mint validation in `/api/price/:mint`** — Replace length check with `isValidPublicKey()`. ~2 minutes to fix.

5. **M2: Add slippageBps validation to cross-chain quote** — Match the same-chain quote endpoint's validation. ~5 minutes to fix.

---

## What IS Working Well

- **Authentication is rock-solid.** The Telegram initData HMAC implementation follows the spec perfectly, uses `crypto.timingSafeEqual`, enforces 1-hour TTL, checks for NaN, and fails closed on every error path. The unit tests thoroughly validate this.

- **Fee collection is bulletproof.** Server-side validation of `platformFeeBps` prevents bypass attacks. The ATA derivation is deterministic and correct. Fee wallet is Zod-validated on startup. Five unit tests cover fee bypass scenarios.

- **Non-custodial model is clean.** No private key material exists anywhere in the server codebase. All transaction signing happens exclusively in the browser via Privy. The server only builds unsigned transactions.

- **Scanner is well-optimized.** RPC calls are minimized via shared data fetching, checks run in parallel, errored checks are correctly excluded from scoring, and weights match documentation.

- **Quote snapshot integrity is excellent.** 30-second expiry, AbortController on input changes, and input/mint/amount verification at swap time prevent stale or mismatched quotes from being submitted.

- **Input validation is strong across most routes.** Mint addresses are validated with `isValidPublicKey()`, wallet addresses with `isValidSolanaAddress()`, amounts are checked for positivity and finiteness, and Zod schemas validate external API responses.

- **Graceful shutdown, PM2 config, and environment validation are all production-grade.** Required vars crash on startup, CORS wildcard crashes in production, and the shutdown sequence properly closes bot → server → database.

---

## v1.0 Launch Checklist

- [x] All CRITICAL findings resolved (none found)
- [ ] All HIGH findings resolved or accepted with documented risk
  - [ ] H1: Add user ownership check to `/api/swap/status`
  - [ ] H2: Validate BigInt inputs in `/api/swap/confirm`
  - [ ] H3: Implement data deletion endpoint (or document as accepted risk for beta)
- [ ] Manual end-to-end swap with real SOL passes
- [ ] Manual token scan returns expected results
- [ ] Auth rejection works (tested with curl — no Authorization header → 401)
- [ ] Fee arrives in FEE_WALLET_ADDRESS after a swap (check Solscan)
- [ ] Uptime monitoring configured (UptimeRobot or equivalent)
- [ ] NODE_ENV=production set on VPS
- [ ] CORS_ORIGIN set to Vercel URL (not *)
- [ ] JUPITER_API_KEY set from portal.jup.ag
- [ ] npm test → 23/23 pass
- [ ] npm run test:live → 13/13 pass
- [ ] npm run test:live:prod → 13/13 pass

---

## Estimated Path to v1.0

| Priority | Items | Effort |
|----------|-------|--------|
| **Immediate** (H1 + H2 + M1 + M2) | Input validation + ownership checks | ~20 minutes |
| **Before public launch** (H3 + M3 + M5) | GDPR deletion + BigInt display fix + DB encryption | ~2-4 hours |
| **Phase 3** (L1-L7 + all LOW items) | CI/CD, structured logging, age bug fix, etc. | ~1-2 days |

**Bottom line:** The codebase is at **82/100** — solid for a controlled soft beta with 50-100 users. Fix H1 and H2 (20 minutes of work) to reach **87/100**. Address GDPR (H3) and database encryption (M5) before broader public launch to reach **92+/100**.
