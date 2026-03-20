# Scanner V2: Multi-Chain Token Safety Scanner — Implementation Plan

## Overview

Upgrade the token scanner from 6 Solana-only checks (max 105 points) to a comprehensive
multi-chain scanner covering **Solana (12 checks)** and **EVM tokens (8 checks)** — all
in-house using existing RPC endpoints. No external APIs.

---

## Phase 1: New Solana Checks — COMPLETE ✅ (2026-03-20)

All 6 new checks implemented, wired, scored, and documented.

### Step 0: Fix Vercel Build Error — DONE
- [x] Add missing `tier` property to AdminPanel test mock

### Step 1: New Solana Scanner Checks — DONE
All 6 checks added to `src/scanner/checks.ts`:

| # | Check | Weight | Status |
|---|-------|--------|--------|
| 1 | **Liquidity Pool** | 25 | ✅ Raydium V4 AMM Authority pool detection |
| 2 | **Metadata Mutability** | 15 | ✅ Metaplex PDA borsh parsing, `isMutable` flag |
| 3 | **Update Authority** | 10 | ✅ Checks if update authority revoked (system program) |
| 4 | **Honeypot Detection** | 20 | ✅ Jupiter sell simulation (token → WSOL) |
| 5 | **Creator Holdings** | 15 | ✅ Oldest signature → deployer → current balance vs supply |
| 6 | **Transfer Fee** | 10 | ✅ Token-2022 TLV extension parsing |

### Step 2: Update `analyze.ts` — DONE
- [x] Fetch Metaplex metadata PDA in initial `Promise.all()` (shared by mutability + update authority)
- [x] 7 async checks in Phase 2 parallel batch
- [x] 5 sync checks in Phase 3 inline
- [x] Normalized scoring: `score = unsafeWeight / totalPossibleWeight * 100`
- [x] Errored checks excluded from both numerator and denominator

### Step 3: Update Frontend — DONE
- [x] All 6 new check info entries added to `CHECK_INFO` in `ScanPanel.tsx`

### Step 4: Category Grouping — DEFERRED to Phase 3
Category headers and `category` field on `CheckResult` moved to Phase 3 (UI Polish).
Current implementation works without categories — checks display in weight-descending order.

**Final weight table (12 checks, 200 total):**

```
Mint Authority        30     Liquidity Pool           25
Freeze Authority      20     Honeypot Detection       20
Top Holders           20     Metadata Mutability      15
Token Metadata        15     Creator Holdings         15
Jupiter Verified      10     Update Authority         10
Token Age             10     Transfer Fee             10
                    ────                             ────
Subtotal:            105     Subtotal:               95
                Combined: 200 → normalized to 0-100
```

**RPC optimizations implemented:**
- `accountInfo` fetched once → shared by mintAuthority + freezeAuthority + transferFee
- `supplyInfo` fetched once → shared by topHolders + creatorHoldings
- `metaplexData` fetched once → shared by metadataMutability + updateAuthority
- `tokenMeta` (Jupiter cache) → shared by jupiterVerified + hasMetadata

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

### Phase 1 (COMPLETE — 2026-03-20):
| File | Changes |
|------|---------|
| `src/scanner/checks.ts` | Added 6 new check functions + `fetchMetaplexMetadata()` + `getMetadataPda()` helper |
| `src/scanner/analyze.ts` | Wired 12 checks, 3-phase execution, normalized scoring |
| `webapp/src/components/ScanPanel.tsx` | Added 6 CHECK_INFO entries for new checks |

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
