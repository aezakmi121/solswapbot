# Scanner V2: Multi-Chain Token Safety Scanner — Implementation Plan

## Overview

Upgrade the token scanner from 6 Solana-only checks (max 105 points) to a comprehensive
multi-chain scanner covering **Solana (12 checks)** and **EVM tokens (8 checks)** — all
in-house using existing RPC endpoints. No external APIs.

---

## Phase 1: Fix Build Error + New Solana Checks (this session)

### Step 0: Fix Vercel Build Error
- [x] Add missing `tier` property to AdminPanel test mock

### Step 1: New Solana Scanner Checks (in `src/scanner/checks.ts`)

Add 6 new checks to the existing scanner. All use the existing Helius RPC — no new API keys.

| # | Check | Weight | What it detects | How to implement |
|---|-------|--------|----------------|-----------------|
| 1 | **Liquidity Burned/Locked** | 25 | LP tokens not burned = dev can rug by removing liquidity | Find Raydium/Orca pool for the mint → get `lpMint` → check if LP tokens sent to burn address (`1111...1111`) or held by a known locker program. If no pool found, flag as "No liquidity pool detected". |
| 2 | **Metadata Mutability** | 15 | Dev can change token name/symbol/image after launch to impersonate legit tokens | Derive Metaplex metadata PDA → fetch account → read `isMutable` byte (offset varies by version). Safe if `isMutable === false`. |
| 3 | **Update Authority** | 10 | Dev can modify metadata at will | Same Metaplex metadata account → read `updateAuthority` field. Safe if set to `11111111111111111111111111111111` (system program = revoked). |
| 4 | **Honeypot Detection** | 20 | Token can be bought but not sold | Call Jupiter quote API for a SELL direction (token → SOL). If no route found or error, it's likely a honeypot. Use existing `getQuote()` from `jupiter/quote.ts`. |
| 5 | **Creator Token Holdings** | 15 | Deployer still holds large % = dump risk | Walk mint's signature history to find deployer (first signer). Check their current token balance vs total supply. Unsafe if >10%. |
| 6 | **Token-2022 Transfer Fee** | 10 | Hidden tax on every transfer | If token is Token-2022 program, parse extension data for `TransferFee` extension. Report fee % if present. |

**Updated weight table after Phase 1:**

```
Existing:                    New:
Mint Authority        30     Liquidity Burned/Locked  25
Freeze Authority      20     Honeypot Detection       20
Top Holders           20     Metadata Mutability      15
Token Metadata        15     Creator Holdings         15
Jupiter Verified      10     Update Authority         10
Token Age             10     Token-2022 Transfer Fee  10
                    ────                             ────
Subtotal:            105     Subtotal:               95

Combined max:        200 → clamped to 100
```

**Scoring adjustment:** With 12 checks totaling 200 max weight, we normalize:
`riskScore = Math.round((rawScore / totalPossibleWeight) * 100)` — this way adding
checks doesn't inflate the score. Only count weights from non-errored checks in the
denominator.

### Step 2: Update `analyze.ts`

- Fetch Metaplex metadata PDA in initial `Promise.all()` (shared by mutability + update authority checks)
- Add honeypot check (Jupiter sell quote)
- Add liquidity check (Raydium pool lookup)
- Add creator holdings check
- Add Token-2022 extension check
- Update scoring to use normalized percentage instead of raw sum

### Step 3: Update Frontend — Check Explanations

Add entries to `CHECK_INFO` in `ScanPanel.tsx` for all 6 new checks:

```typescript
"Liquidity Burned": "Liquidity pool tokens (LP) should be burned or locked. If the creator still holds LP tokens, they can withdraw all liquidity at any time, making the token unsellable.",
"Metadata Mutability": "If metadata is mutable, the creator can change the token's name, symbol, and image after launch — potentially impersonating legitimate tokens.",
"Update Authority": "The update authority controls who can modify the token's on-chain metadata. It should be revoked (set to the system program) for maximum safety.",
"Honeypot Detection": "We simulate selling this token back to SOL. If no sell route exists, the token may be a honeypot — you can buy but never sell.",
"Creator Holdings": "Shows what percentage of the supply the token creator still holds. Large creator holdings (>10%) mean they could dump at any time.",
"Transfer Fee": "Some Token-2022 tokens have a built-in transfer fee that takes a percentage on every transfer. This is a hidden tax most buyers don't expect.",
```

### Step 4: Update `ScanResult` Response

Add a `category` field to `CheckResult` for grouping in the UI:
- `"authority"` — Mint Authority, Freeze Authority, Update Authority, Metadata Mutability
- `"liquidity"` — Liquidity Burned, Honeypot Detection
- `"distribution"` — Top Holders, Creator Holdings
- `"identity"` — Token Metadata, Jupiter Verified, Token Age, Transfer Fee

Frontend groups checks by category with section headers.

---

## Phase 2: EVM Token Scanner (future session)

### Architecture

The scan route detects chain by address format:
- Solana address (base58, 32-44 chars) → existing Solana scanner
- EVM address (`0x` + 40 hex chars) → new EVM scanner

Backend needs one free RPC per chain (no API key required):
- Ethereum: `https://eth.llamarpc.com` or Infura free tier
- BSC: `https://bsc-dataseed.binance.org`
- Polygon: `https://polygon-rpc.com`
- Arbitrum: `https://arb1.arbitrum.io/rpc`
- Base: `https://mainnet.base.org`

### EVM Checks (8 checks, all via `eth_call` / `eth_getStorageAt`)

| # | Check | Weight | How |
|---|-------|--------|-----|
| 1 | **Owner Renounced** | 25 | Call `owner()` selector `0x8da5cb5b` → check if `address(0)` |
| 2 | **Proxy Contract** | 20 | Read EIP-1967 implementation slot. If proxy, flag as upgradeable (dev can change logic) |
| 3 | **Honeypot Simulation** | 20 | Use LI.FI quote API to simulate a sell. No route = honeypot. |
| 4 | **Contract Verified** | 15 | Check if contract has code (`eth_getCode`). Can't verify source without explorer API, but can flag if code is suspiciously small/large. |
| 5 | **Total Supply / Top Holders** | 15 | Call `totalSupply()` + check if any single holder has >20% |
| 6 | **Mint Function** | 15 | Call `totalSupply()` at two points or check if contract has `mint` selector in bytecode |
| 7 | **Transfer Tax** | 10 | Simulate transfer and compare input/output amounts |
| 8 | **Liquidity** | 10 | Check if main DEX pair has reasonable TVL |

### Frontend Changes for EVM
- Input field accepts both Solana and EVM addresses
- Chain auto-detected from address format
- Chain badge shown on results (🟣 Solana / 🔷 Ethereum / etc.)
- Check names may differ per chain but categories stay the same

---

## Phase 3: Scanner UI Polish (can be done alongside Phase 1 or 2)

- **Category headers** in check results: "Authorities", "Liquidity", "Distribution", "Identity"
- **"What We Checked" explainer section** at the bottom of every scan — a collapsible card
  summarizing all checks and what they mean, so users learn to evaluate tokens themselves
- **Risk breakdown bar** — horizontal stacked bar showing which categories contributed most
  to the risk score (visual: red segments for unsafe checks, green for safe)
- **Share scan result** — generate a shareable summary card image or text for Telegram

---

## Files Modified

### Phase 1 (this session):
| File | Changes |
|------|---------|
| `src/scanner/checks.ts` | Add 6 new check functions |
| `src/scanner/analyze.ts` | Wire new checks, normalize scoring |
| `webapp/src/components/ScanPanel.tsx` | Add CHECK_INFO entries, category grouping |
| `webapp/src/lib/api.ts` | Update ScanResult type if needed |
| `webapp/src/styles/index.css` | Category header styles |
| `webapp/src/components/__tests__/AdminPanel.test.tsx` | Fix `tier` property (build fix) |

### Phase 2 (future):
| File | Changes |
|------|---------|
| `src/scanner/evmChecks.ts` | NEW — EVM check functions |
| `src/scanner/evmAnalyze.ts` | NEW — EVM orchestrator |
| `src/scanner/analyze.ts` | Add chain detection router |
| `src/api/routes/scan.ts` | Accept EVM addresses |
| `src/config.ts` | Add EVM RPC URLs |
| `webapp/src/components/ScanPanel.tsx` | Chain badge, EVM address support |

---

## Risk Assessment

- **No new API keys needed** for Phase 1 — all checks use existing Helius RPC
- **No DB schema changes** — existing `TokenScan` model stores results as-is
- **Scoring change is backwards-compatible** — old scans in DB keep their original scores;
  new scans use normalized scoring
- **Honeypot check adds ~1-2s** to scan time (Jupiter quote call) — acceptable
- **Liquidity check may fail** for tokens not on Raydium/Orca — handled via `errored: true`
- **EVM Phase 2** uses free public RPCs — rate limits are generous (10-50 req/s)
