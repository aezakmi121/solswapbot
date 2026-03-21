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

## Phase 2: EVM Token Scanner — COMPLETE ✅ (2026-03-21)

Full EVM token scanner supporting 5 chains: Ethereum, BSC, Polygon, Arbitrum, Base.

### Architecture — DONE
- [x] Scan route auto-detects chain from address format (0x... → EVM, base58 → Solana)
- [x] Optional `?chain=` query param for EVM (default: ethereum)
- [x] Free public RPCs configured in `config.ts` with defaults (no API keys needed)
- [x] `isValidEvmAddress()` added to `validation.ts`

### EVM Checks (8 checks, total weight 130, normalized to 0-100) — DONE

| # | Check | Weight | Implementation |
|---|-------|--------|---------------|
| 1 | **Owner Renounced** | 25 | ✅ `owner()` selector → check if `address(0)`. No owner() = non-Ownable (safe). |
| 2 | **Proxy Contract** | 20 | ✅ EIP-1967 implementation slot. Non-zero = upgradeable proxy. |
| 3 | **Honeypot Simulation** | 20 | ✅ LI.FI sell quote (token → wrapped native). No route = honeypot. Known tokens skipped. |
| 4 | **Contract Code** | 15 | ✅ `eth_getCode` — no code = EOA, <100 bytes = suspicious. |
| 5 | **Top Holders** | 15 | ✅ `totalSupply()` + contract self-balance check + dead address burn check. |
| 6 | **Mint Function** | 15 | ✅ Bytecode scan for `mint(address,uint256)` + `mint(uint256)` selectors. Cross-refs owner renounced. |
| 7 | **Transfer Tax** | 10 | ✅ Bytecode scan for fee-on-transfer selectors (setTaxFeePercent, excludeFromFee, etc.). |
| 8 | **Liquidity** | 10 | ✅ Checks DEX factory pairs (Uniswap/PancakeSwap/QuickSwap/Camelot/Aerodrome) + USDC pair fallback. |

### EVM Token Info Fetcher — DONE
- [x] `fetchEvmTokenInfo()`: parallel `name()`, `symbol()`, `decimals()`, `totalSupply()` calls
- [x] ABI string decoding for dynamic return types

### Frontend Changes — DONE
- [x] Input accepts both Solana and EVM addresses
- [x] Chain auto-detected from address format (0x → EVM chain chips appear)
- [x] EVM chain selector chips: Ethereum, BSC, Polygon, Arbitrum, Base
- [x] Chain badge on results (🟣 Solana / 🔷 Ethereum / 🟡 BNB / 🟪 Polygon / 🔵 Arbitrum/Base)
- [x] 6 new CHECK_INFO entries for EVM checks
- [x] "Swap This Token" hidden for EVM scans (Solana-only feature)
- [x] `fetchTokenScan()` API function accepts optional `chain` param

### Files Modified (Phase 2):
| File | Changes |
|------|---------|
| `src/scanner/evmChecks.ts` | NEW — 8 EVM check functions + `fetchEvmTokenInfo()` + RPC helpers |
| `src/scanner/evmAnalyze.ts` | NEW — EVM orchestrator (3-phase: fetch → 8 parallel checks → scoring) |
| `src/scanner/analyze.ts` | Added `chain` field to `ScanResult` interface |
| `src/api/routes/scan.ts` | Auto-detects EVM/Solana, routes to correct scanner, accepts `?chain=` param |
| `src/config.ts` | Added 5 EVM RPC URL config vars with defaults |
| `src/utils/validation.ts` | Added `isValidEvmAddress()` |
| `webapp/src/lib/api.ts` | `ScanResult.chain` field + `fetchTokenScan(mint, chain?)` |
| `webapp/src/components/ScanPanel.tsx` | EVM chain selector, chain badge, EVM check explanations |
| `webapp/src/styles/index.css` | `.scan-chain-*` classes for chain selector UI |

### RPC Optimizations:
- `eth_getCode` fetched once → shared by contractCode + mintFunction + transferTax
- `totalSupply` fetched once → shared by evmAnalyze + topHolders
- All 8 checks run in parallel (single `Promise.all`)

---

## Phase 3: Scanner UI Polish (future)

- **Category headers** in check results: "Authorities", "Liquidity", "Distribution", "Identity"
- **"What We Checked" explainer section** at the bottom of every scan — a collapsible card
  summarizing all checks and what they mean, so users learn to evaluate tokens themselves
- **Risk breakdown bar** — horizontal stacked bar showing which categories contributed most
  to the risk score (visual: red segments for unsafe checks, green for safe)
- **Share scan result** — generate a shareable summary card image or text for Telegram
- **EVM price lookup** — integrate CoinGecko or Moralis for EVM token USD prices in scan results

---

## Risk Assessment

- **No new API keys needed** — Solana checks use Helius RPC, EVM checks use free public RPCs
- **No DB schema changes** — existing `TokenScan` model stores results as-is (chain agnostic)
- **Scoring is backwards-compatible** — old scans in DB keep their original scores
- **Honeypot check adds ~1-2s** to scan time (LI.FI/Jupiter quote call) — acceptable
- **Liquidity check may fail** for tokens not on major DEXs — handled via `errored: true`
- **EVM public RPCs** have generous rate limits (10-50 req/s) — sufficient for scanner use
- **EVM bytecode analysis is heuristic** — checks for known function selectors, not source verification
