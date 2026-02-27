# SolSwap — Full v1.0 Pre-Launch Audit Prompt

> **Model:** Claude Opus 4.6 (`claude-opus-4-6`) via Claude Code CLI
> **Usage:** Paste the prompt below into a fresh Claude Code session at the project root.
> **Estimated session time:** 45–90 minutes of agentic exploration.
> **Last updated:** 2026-02-27

---

## How To Use This Prompt

1. `cd ~/solswapbot`
2. Open a new Claude Code session: `claude` (make sure you're on Opus 4.6 — toggle with `/model` or `--model claude-opus-4-6`)
3. Paste the entire block below as your first message
4. Let it run uninterrupted — it will read files, search code, and produce a structured report
5. Save the output report as `AUDIT_REPORT_<date>.md`

---

## THE PROMPT (copy everything below this line)

---

You are performing a **comprehensive pre-launch audit** of SolSwap — a non-custodial Telegram Mini App for token swaps across 6 blockchains. You are an expert in:
- TypeScript / Node.js backend security and correctness
- React / Vite frontend architecture and UX
- Solana blockchain, SPL tokens, and Jupiter DEX integration
- Telegram Mini App development (initData auth, WebApp SDK)
- Prisma ORM / SQLite data modeling
- Production infrastructure (PM2, VPS, Vercel)
- Security (OWASP Top 10, crypto, auth, injection)
- Privacy and data minimization
- DeFi app threat modeling (fee bypass, MEV, fake confirmations)

**Your mission:** Read the entire codebase, then produce a structured audit report with numbered findings, severity ratings, and a final production-readiness score. The developer is a solo dev preparing for v1.0 launch.

**Start by reading CLAUDE.md** to orient yourself, then systematically explore every area listed below.

---

## AUDIT AREAS (work through all of these)

### AREA 1 — Backend API Logic & Correctness

Read every file in `src/api/routes/` and `src/api/middleware/`. For each route, verify:

1. **Auth enforcement** — Is `telegramAuth` middleware correctly applied? Any route missing it that shouldn't be public?
2. **Input validation** — Are all query params / body fields validated before use? Check for missing `.trim()`, missing type coercions, or unchecked array accesses.
3. **Error handling** — Does every route have try/catch? Are errors surfaced cleanly (no raw stack traces in responses)?
4. **Business logic correctness** — Does each route do what CLAUDE.md says it should? Look for logic bugs (e.g. wrong field used, off-by-one in pagination, wrong status codes).
5. **telegramId trust** — Is `res.locals.telegramId` always used? Is there anywhere the client-supplied telegramId from the body is trusted?
6. **Rate limiting** — Is `express-rate-limit` configured correctly in `server.ts`? What are the exact limits? Are they appropriate for a production app?

### AREA 2 — Authentication & Security (Telegram initData HMAC)

Read `src/api/middleware/telegramAuth.ts` very carefully. Verify:

1. **HMAC algorithm correctness** — Does it follow the exact Telegram spec? (`HMAC-SHA256(data_check_string, HMAC-SHA256("WebAppData", bot_token))`)
2. **Key derivation** — Is the secret key derived with `"WebAppData"` as the HMAC key (not as the data)?
3. **Data-check-string construction** — Are fields sorted lexicographically? Is `hash` excluded?
4. **Timing-safe comparison** — Is `crypto.timingSafeEqual` used instead of `===` for hash comparison? (String `===` is vulnerable to timing attacks)
5. **Expiry enforcement** — Is `auth_date` checked? What's the TTL? Is it validated as a number (not NaN)?
6. **User field extraction** — Is `user.id` correctly parsed from the verified payload?
7. **Edge cases** — What happens with malformed initData (missing fields, wrong encoding)? Does it fail open or closed?

Cross-reference with `src/__tests__/smoke.test.ts` — do the unit tests match the actual implementation?

### AREA 3 — Fee Collection & Revenue Security

Read `src/jupiter/quote.ts` and `src/jupiter/swap.ts`. Verify:

1. **Fee bypass prevention** — Does `swap.ts` validate that `quoteResponse.platformFee.feeBps === config.PLATFORM_FEE_BPS`? What's the exact check?
2. **Fee account derivation** — Is `feeAccount` derived correctly via `getAssociatedTokenAddressSync(outputMint, FEE_WALLET, true)`? Is the `true` (allowOwnerOffCurve) flag correct for a fee wallet?
3. **Fee wallet validation** — Is `FEE_WALLET_ADDRESS` validated as a valid Solana public key on startup?
4. **Quote snapshot integrity** — Can a malicious client reuse a quote from a different amount/token pair? Is there any quote-to-swap binding?
5. **Platform fee on cross-chain** — Are LI.FI cross-chain swaps also generating fees? If not, is this documented?

### AREA 4 — Solana Transaction Security

Read `src/jupiter/swap.ts`, `src/api/routes/send.ts`, and `src/solana/transaction.ts`. Verify:

1. **Unsigned transaction model** — The server builds transactions but never signs them. Is there any code path where the server would sign?
2. **ATA creation** — In `send.ts`, when a recipient ATA doesn't exist, who pays rent? Is this handled correctly? Can a user drain themselves paying rent for many ATAs?
3. **Amount validation** — In `send.ts`, is the `amount` validated to be a positive number? Is there a check preventing `amount > balance`? (Note: server can't check balance, but client-side validation matters)
4. **Transaction deserialization** — When returning `base64` transactions, is the encoding/decoding round-trip correct? Any truncation or corruption risk?
5. **Confirmation polling** — In `transaction.ts`, what happens after 100 attempts (TIMEOUT)? Is the swap record correctly updated? Can a timeout be exploited to double-spend?
6. **`lastValidBlockHeight`** — Is this field passed through correctly from Jupiter/Solana and returned to the client?

### AREA 5 — Database Layer (Prisma / SQLite)

Read `prisma/schema.prisma` and all files in `src/db/queries/`. Verify:

1. **BigInt handling** — `Swap.inputAmount` / `outputAmount` are `BigInt`. Are they ever accidentally cast to `Number` (losing precision above 2^53)?
2. **Decimal handling** — `feeAmountUsd` is `Decimal`. Is it always treated as `Decimal` (not `Number`) for calculations?
3. **SQL injection risk** — Prisma ORM prevents raw SQL injection by default. Are there any `prisma.$queryRaw` or `prisma.$executeRaw` calls that could be injection vectors?
4. **Index coverage** — Do the indexes in `schema.prisma` match the actual query patterns? Are there any N+1 or full-table-scan risks in the queries?
5. **Race conditions** — SQLite + PM2 single instance prevents write conflicts. Is there anywhere the code assumes atomicity that SQLite doesn't guarantee?
6. **Data retention** — Is any sensitive data stored that shouldn't be? Is there a data expiry/cleanup strategy?
7. **Migration safety** — `npx prisma db push` is used (not migrations). What's the risk of schema drift between dev and production? Are any destructive changes safe?

### AREA 6 — Token Scanner Correctness & Security

Read `src/scanner/analyze.ts` and `src/scanner/checks.ts`. Verify:

1. **Risk score correctness** — Does the weight math match CLAUDE.md? (Mint 30, Freeze 20, Holders 20, Metadata 15, Jupiter 10, Age 10 = max 105, clamped to 100)
2. **Errored flag behavior** — If a check errors (network failure), does it correctly set `errored: true, safe: true` and get excluded from scoring?
3. **RPC call efficiency** — Is `accountInfo` really fetched once and shared? Is there any double-fetching?
4. **Top holders check** — What threshold triggers `safe: false`? Is the holder concentration logic correct?
5. **Known token age bug (AGE-1)** — Confirm the bug exists exactly as documented. Does it only affect the 10-point check?
6. **Scan persistence** — Are scan results always saved to DB? What if the Prisma write fails — does the user still get the scan result?
7. **Mint address validation** — Is the mint address validated with `isValidPublicKey` (not `isValidSolanaAddress`) before RPC calls?

### AREA 7 — Cross-Chain Integration (LI.FI)

Read `src/aggregator/lifi.ts`, `src/aggregator/router.ts`, `src/aggregator/chains.ts`, and `src/api/routes/crossChain.ts`. Verify:

1. **Zod validation** — Are LI.FI responses Zod-validated? What fields are required?
2. **Error propagation** — If LI.FI is down, does the route return a clean error (not a 500 stack trace)?
3. **Retry logic** — Is `withRetry` applied to LI.FI calls? What are the retry settings?
4. **Chain/token registry consistency** — Do `src/aggregator/chains.ts` (backend) and `webapp/src/lib/chains.ts` (frontend) list the same chains and tokens? Any mismatch that could cause quote failures?
5. **SOL address handling** — Is Wrapped SOL (`So111...112`) used consistently for cross-chain SOL representation?
6. **Fee collection on cross-chain** — Documented as "not yet live." Is there any code that incorrectly charges fees on cross-chain swaps, or vice versa passes `platformFeeBps` to LI.FI?

### AREA 8 — Frontend: React State & UX Correctness

Read `webapp/src/App.tsx`, `webapp/src/components/SwapPanel.tsx`, `webapp/src/components/WalletTab.tsx`, and `webapp/src/lib/api.ts`. Verify:

1. **Auth header construction** — How does `api.ts` get `tg.initData`? Is it correctly URL-encoded? Is the `Authorization: tma <initData>` format correct?
2. **Quote expiry logic** — Does `SwapPanel.tsx` actually implement the 30s expiry + auto-refresh? Is the AbortController wired correctly on input changes?
3. **Quote snapshot integrity** — When the user clicks "Swap," does the code verify the quote inputs still match the current UI state?
4. **Privy integration** — How does `useSignAndSendTransaction` get called? Is there error handling for Privy errors (rejected by user, network failure)?
5. **Wallet state sharing** — How is the wallet address shared between tabs? Is there a race condition where swap fires before wallet is set?
6. **Error boundaries** — Does `ErrorBoundary.tsx` catch all component errors? Are there any async errors that escape the boundary?
7. **Send flow validation** — Does `SendFlow.tsx` validate the recipient address client-side before calling the API? Is `isValidSolanaAddress` used correctly (ed25519 only)?
8. **Token list caching** — `loadTokenList()` has a TTL cache. Is there a race condition where two concurrent fetches both trigger a load?
9. **localStorage keys** — Are all localStorage keys namespaced consistently (`solswap_*`)? Any risk of collision with Privy's own localStorage?

### AREA 9 — Privacy & Data Minimization

For a Telegram Mini App handling financial transactions, answer:

1. **What PII is stored?** List every field in the database that could be considered personally identifiable.
2. **Telegram user data** — What Telegram user fields are stored (ID, username, first name, photo?)? Is more stored than necessary?
3. **Transaction linkability** — Can an observer link Solana wallet addresses back to Telegram IDs via the database? What's the privacy model?
4. **Log data** — What does `logger.ts` log? Are wallet addresses or amounts logged? Where do PM2 logs go, and for how long?
5. **initData exposure** — Is the raw initData string logged anywhere? It contains user info.
6. **No server-side keys** — Confirm absolutely no private key material passes through the server in any code path.
7. **GDPR / data deletion** — Is there any endpoint or capability to delete a user's data? (Not required for launch, but note the gap.)

### AREA 10 — Infrastructure & Deployment

Read `ecosystem.config.js`, check for `.env.example`, and review `src/config.ts`. Verify:

1. **PM2 config correctness** — Single instance? Memory limit? Auto-restart on crash? Log rotation?
2. **Environment var safety** — Does `config.ts` crash on startup if required vars are missing? List exactly which vars crash vs which have defaults.
3. **Production CORS** — What happens if `CORS_ORIGIN=*` is set in production? Is the crash-guard implemented?
4. **Secret handling** — Is `.env` in `.gitignore`? Is `dev.db` in `.gitignore`?
5. **Vercel rewrite config** — Read `webapp/vercel.json`. Does the rewrite pattern correctly forward all `/api/*` requests to the VPS?
6. **Database path** — Is the SQLite database path absolute or relative? What's the risk of PM2 changing cwd?
7. **Graceful shutdown** — Does `src/app.ts` handle `SIGTERM` / `SIGINT` correctly to close DB connections and in-flight requests?
8. **Build output** — Does `npm run build` (`tsc`) produce a clean `dist/` that matches the `ecosystem.config.js` entry point?

### AREA 11 — Smoke Test Coverage Analysis

Read `src/__tests__/smoke.test.ts` and `scripts/smoke-test.sh`. Evaluate:

1. **Unit test coverage** — What does `npm test` actually test? Are the test implementations correct (not just testing a copy of the logic but something that could fail if the real code broke)?
2. **Integration test gaps** — What critical paths are NOT covered by `npm run test:live`? (e.g., `/api/scan`, cross-chain routes, portfolio, transactions)
3. **Test quality** — Are there any tests that always pass regardless of implementation? (False positives)
4. **Missing test cases** — What are the top 5 tests that would provide the most value to add?
5. **CI/CD** — Is there a GitHub Actions workflow? If not, is the test suite runnable in a CI environment?

### AREA 12 — Code Quality & Maintainability

Do a broad scan across the codebase:

1. **TypeScript strictness** — Read `tsconfig.json`. Is `strict: true` enabled? Are there any `any` types that could hide bugs?
2. **Unhandled promises** — Are there any `async` functions called without `await` or `.catch()`? Any fire-and-forget that could fail silently?
3. **Dead code** — Are there any imports, functions, or variables that are defined but never used?
4. **Inconsistent patterns** — Are there routes that don't follow the try/catch pattern? Any direct `res.json()` without error handling?
5. **TODO/FIXME comments** — List any in the codebase and assess their severity.
6. **Dependency audit** — Are there any outdated or vulnerable packages? (Check against known CVEs for express, grammy, @solana/web3.js, @privy-io/react-auth)
7. **console.log vs proper logging** — Are there stray `console.log` statements that should be removed or replaced with structured logging?

---

## OUTPUT FORMAT

Produce your report in this exact structure:

```
# SolSwap Pre-Launch Audit Report
Generated: <date>
Audited by: Claude Opus 4.6

## Executive Summary
<3-5 sentence summary of overall state>

## Production Readiness Score: X/100

### Score Breakdown
| Category | Score | Max | Notes |
|----------|-------|-----|-------|
| Backend API Logic | /15 | 15 | |
| Authentication & Security | /20 | 20 | |
| Fee Collection & Revenue | /10 | 10 | |
| Solana Transaction Safety | /10 | 10 | |
| Database Layer | /8 | 8 | |
| Token Scanner | /5 | 5 | |
| Cross-Chain Integration | /5 | 5 | |
| Frontend Logic & UX | /10 | 10 | |
| Privacy & Data Minimization | /7 | 7 | |
| Infrastructure & Deployment | /7 | 7 | |
| Test Coverage | /3 | 3 | |
| **TOTAL** | **/100** | **100** | |

## Findings

### CRITICAL (score 0, must fix before any real money)
[Numbered findings with: Area, File:Line, Description, Impact, Fix]

### HIGH (score -5 each, should fix before public launch)
[Numbered findings]

### MEDIUM (score -2 each, fix before scaling)
[Numbered findings]

### LOW (score -0.5 each, fix in Phase 3)
[Numbered findings]

### INFORMATIONAL (no score impact)
[Notes, suggestions, observations]

## Top 5 Fixes For Immediate Impact
1.
2.
3.
4.
5.

## What IS Working Well
[Acknowledge solid implementations — be specific]

## v1.0 Launch Checklist
[ ] All CRITICAL findings resolved
[ ] All HIGH findings resolved or accepted with documented risk
[ ] Manual end-to-end swap with real SOL passes
[ ] Manual token scan returns expected results
[ ] Auth rejection works (tested with curl — no Authorization header → 401)
[ ] Fee arrives in FEE_WALLET_ADDRESS after a swap (check Solscan)
[ ] Uptime monitoring configured (UptimeRobot or equivalent)
[ ] NODE_ENV=production set on VPS
[ ] CORS_ORIGIN set to Vercel URL (not *)
[ ] JUPITER_API_KEY set from portal.jup.ag
[ ] npm test → 23/23 pass
[ ] npm run test:live → 13/13 pass
[ ] npm run test:live:prod → 13/13 pass

## Estimated Time to v1.0
<Honest estimate broken down by finding severity>
```

---

## IMPORTANT INSTRUCTIONS FOR THE AUDIT SESSION

- **Read before you conclude.** If you're unsure about a finding, read the actual file before marking it as a bug. Don't rely on CLAUDE.md descriptions alone.
- **Be specific with file:line references.** Every finding needs a file path and approximate line number.
- **Distinguish "by design" from "bug."** Some things (e.g. no receive tracking) are documented design decisions, not bugs.
- **Score honestly.** If the codebase is 85/100, say 85. Don't inflate or deflate.
- **Security findings are non-negotiable.** Any auth bypass, fee bypass, or private key exposure gets CRITICAL regardless of exploitability.
- **Check the actual code, not just structure.** The CLAUDE.md says things are implemented — verify they actually are in the code.

---

## CONTEXT (paste this alongside the prompt if needed)

- **Stack:** Grammy bot + Express API + Prisma/SQLite + Vite/React frontend
- **Auth:** Telegram initData HMAC-SHA256 on all protected routes
- **Wallets:** Privy MPC — server never sees private keys
- **Swaps:** Jupiter Swap V1 API (backend builds unsigned tx, Privy signs in browser)
- **Fees:** 0.5% via Jupiter `platformFeeBps=50` into `FEE_WALLET_ADDRESS`
- **Cross-chain:** LI.FI routing (anonymous, no integrator fees yet)
- **Deployment:** VPS (Hostinger, PM2) + Vercel (frontend)
- **Tests passing:** `npm test` → 23/23, `npm run test:live` → 13/13
- **Stage:** Soft beta. Real money capable. Not public yet.
