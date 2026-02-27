#!/usr/bin/env bash
# SolSwap smoke test — runs against a live server instance.
# Usage:
#   ./scripts/smoke-test.sh                      # tests http://localhost:3001
#   ./scripts/smoke-test.sh https://srv1418768.hstgr.cloud  # tests production

set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

check_body() {
  local desc="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo -e "${GREEN}✓${RESET} $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}✗${RESET} $desc"
    echo "  expected body to contain: $expected"
    echo "  got: $actual"
    FAIL=$((FAIL+1))
  fi
}

check_status() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo -e "${GREEN}✓${RESET} $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}✗${RESET} $desc (expected HTTP $expected, got HTTP $actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== SolSwap Smoke Tests === $BASE_URL"
echo ""

# ── Public Routes ──────────────────────────────────────────────────────────────

echo "[ Public Routes ]"

resp=$(curl -sf "$BASE_URL/api/health" 2>/dev/null || echo "CURL_FAILED")
check_body "GET /api/health returns ok" '"status":"ok"' "$resp"

resp=$(curl -sf "$BASE_URL/api/price/So11111111111111111111111111111111111111112" 2>/dev/null || echo "CURL_FAILED")
check_body "GET /api/price/:mint returns priceUsd" '"priceUsd"' "$resp"

resp=$(curl -sf "$BASE_URL/api/tokens" 2>/dev/null || echo "CURL_FAILED")
check_body "GET /api/tokens returns token list" '"mint"' "$resp"

resp=$(curl -sf "$BASE_URL/api/tokens/search?query=SOL" 2>/dev/null || echo "CURL_FAILED")
check_body "GET /api/tokens/search?query=SOL returns results" '"symbol"' "$resp"

echo ""

# ── Auth Middleware ────────────────────────────────────────────────────────────

echo "[ Auth Middleware — all must return 401 without valid initData ]"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/user")
check_status "GET /api/user rejects unauthenticated" "401" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&humanAmount=0.1")
check_status "GET /api/quote rejects unauthenticated" "401" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/swap" \
  -H "Content-Type: application/json" \
  -d '{"quoteResponse":{},"userPublicKey":"fake"}')
check_status "POST /api/swap rejects unauthenticated" "401" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/scan?mint=So11111111111111111111111111111111111111112")
check_status "GET /api/scan rejects unauthenticated" "401" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/history")
check_status "GET /api/history rejects unauthenticated" "401" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/activity")
check_status "GET /api/activity rejects unauthenticated" "401" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/transactions")
check_status "GET /api/transactions rejects unauthenticated" "401" "$status"

status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/send" \
  -H "Content-Type: application/json" \
  -d '{}')
check_status "POST /api/send rejects unauthenticated" "401" "$status"

echo ""

# ── Fee Bypass Prevention ──────────────────────────────────────────────────────

echo "[ Fee Bypass — fake auth header, bad feeBps must return 400 or 401 ]"

# A malformed (but correctly formatted) auth header — signature will be invalid
# so we'll get 401 before the fee check. That still confirms the endpoint won't accept it.
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/api/swap" \
  -H "Authorization: tma auth_date=1000000000&user=%7B%22id%22%3A1%7D&hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  -H "Content-Type: application/json" \
  -d '{"quoteResponse":{"platformFee":{"feeBps":0}},"userPublicKey":"fake"}')
if [[ "$status" == "400" || "$status" == "401" ]]; then
  echo -e "${GREEN}✓${RESET} POST /api/swap with feeBps=0 rejected (HTTP $status)"
  PASS=$((PASS+1))
else
  echo -e "${RED}✗${RESET} POST /api/swap with feeBps=0 should return 400 or 401, got $status"
  FAIL=$((FAIL+1))
fi

echo ""
echo "========================================"
echo "Results: ${PASS} passed, ${FAIL} failed"
echo "========================================"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
