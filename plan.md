# Telegram Stars Subscription Payment — Implementation Plan

## Overview

Add self-serve subscription purchasing via Telegram Stars so users can upgrade
from FREE to paid tiers (SCANNER_PRO, WHALE_TRACKER, ALL_ACCESS) directly from
the Mini App, the bot, or when hitting usage limits. Includes expiry notifications
and annual discount pricing.

---

## Pricing

| Tier | Monthly | Annual (20% off) | What it unlocks |
|---|---|---|---|
| SCANNER_PRO | 250 Stars | 2400 Stars | Unlimited token scans (vs 10/day free) |
| WHALE_TRACKER | 250 Stars | 2400 Stars | 20 tracked wallets (vs 3 free) |
| ALL_ACCESS | 400 Stars | 3840 Stars | Unlimited scans + 20 wallets |

---

## Files to Create

### 1. `src/bot/handlers/payment.ts` (NEW)

Handles the two Grammy payment events:

```
bot.on("pre_checkout_query") → validate payload → answerPreCheckoutQuery(true)
bot.on("message:successful_payment") → parse payload → upsert Subscription → send confirmation
```

**Payload format:** `TIER|USER_ID|DURATION` (e.g. `SCANNER_PRO|clxyz123|30d` or `ALL_ACCESS|clxyz123|365d`)

- `pre_checkout_query`: parse payload, verify tier is valid, verify user exists in DB → answer OK
- `successful_payment`: parse payload, calculate `expiresAt` (now + 30d or 365d), upsert Subscription record, store `telegram_payment_charge_id` for dedup, send bot confirmation message with tier name + expiry date

Exports: `registerPaymentHandlers(bot: Bot)` — called from `index.ts`

### 2. `src/api/routes/subscribe.ts` (NEW)

Two endpoints:

**`GET /api/user/subscription`** (protected)
- Returns current subscription: `{ tier, expiresAt, isActive }`
- If no subscription record → `{ tier: "FREE", expiresAt: null, isActive: true }`

**`POST /api/subscribe/invoice`** (protected)
- Body: `{ tier: "SCANNER_PRO" | "WHALE_TRACKER" | "ALL_ACCESS", period: "monthly" | "annual" }`
- Validates tier + period
- Calls `botInstance.api.createInvoiceLink(...)` with:
  - `provider_token: ""` (Stars)
  - `currency: "XTR"`
  - `prices: [{ label, amount }]` based on tier + period
  - `payload: "TIER|userId|30d"` or `"TIER|userId|365d"`
- Returns `{ invoiceLink }` → frontend opens via `tg.openInvoice(link)`

Uses the existing `setBotInstance`/`botInstance` pattern from `start.ts`.

### 3. `src/subscription/expiry.ts` (NEW)

Background poller (like bridgePoller):

- Runs every hour via `setInterval`
- Queries subscriptions expiring within 24 hours that haven't been notified
- Sends bot message: "Your {tier} expires tomorrow. Renew to keep unlimited access." + inline keyboard with renew button
- Queries subscriptions that expired since last check
- Sends bot message: "Your {tier} has expired. You're back on the Free plan." + upgrade button
- Uses a simple `notifiedExpiringSoon` flag or checks `expiresAt` vs time window to avoid duplicate notifications

Exports: `startExpiryPoller()` — called from `app.ts`

### 4. `webapp/src/components/UpgradeModal.tsx` (NEW)

Full-screen bottom sheet modal (same pattern as ReferralModal/TermsModal):

- **Tier comparison table:** FREE vs SCANNER_PRO vs WHALE_TRACKER vs ALL_ACCESS
- **Monthly/Annual toggle** with "Save 20%" badge on annual
- **Current tier badge** (highlighted row)
- **"Subscribe" button** per tier → calls `POST /api/subscribe/invoice` → `tg.openInvoice(link)`
- **After payment:** polls `GET /api/user/subscription` every 2s for up to 30s → shows success toast on tier change
- **Close button** + click-outside-to-close

---

## Files to Modify

### 5. `src/bot/index.ts`
- Import and call `registerPaymentHandlers(bot)` after middleware setup, before command handlers
- This registers `pre_checkout_query` and `successful_payment` listeners

### 6. `src/bot/commands/start.ts`
- Export `getBotInstance()` so `subscribe.ts` route can access the bot API for `createInvoiceLink`
- (Currently only exports `setBotInstance`)

### 7. `src/api/server.ts`
- Import `subscribeRouter` from `./routes/subscribe`
- Mount: `app.use("/api", telegramAuthMiddleware, subscribeRouter);`

### 8. `src/app.ts`
- Import and call `startExpiryPoller()` after `startWalletMonitor()`

### 9. `webapp/src/components/ScanPanel.tsx`
- When scan returns 429 (limit reached), show "Upgrade" button that opens UpgradeModal
- Currently just shows error text

### 10. `webapp/src/components/TrackerPanel.tsx`
- When wallet limit hit (403 response), show "Upgrade" button that opens UpgradeModal
- Currently shows text hint "Upgrade to Whale Tracker for 20 slots"

### 11. `webapp/src/components/SettingsPanel.tsx`
- Add "Subscription" section showing: current tier badge, expiry date, "Manage" button to open UpgradeModal
- Place between "Account Security" and "Referral" sections

### 12. `webapp/src/lib/api.ts`
- Add `createInvoice(tier, period)` → `POST /api/subscribe/invoice`
- Add `getSubscription()` → `GET /api/user/subscription`
- Add `SubscriptionInfo` interface

### 13. `webapp/src/styles/index.css`
- Add `.upgrade-modal-*` styles (overlay, card, tier table, toggle, buttons)

### 14. `src/bot/index.ts` — Add `/subscribe` command
- New command: `/subscribe` → sends inline keyboard with 3 tier buttons
- Each button triggers `createInvoiceLink` and sends the invoice directly in chat
- Alternative access point for users who prefer the bot over the Mini App

---

## Expiry Notification Flow

```
Every hour (startExpiryPoller):
  1. Query: WHERE expiresAt BETWEEN now AND now+24h
     → Send "expires tomorrow" bot message (with renew button)
  2. Query: WHERE expiresAt BETWEEN now-1h AND now (just expired)
     → Send "expired, back to Free" bot message (with upgrade button)
```

To avoid duplicate notifications, track with a simple approach:
- "Expiring soon" notification: only send if `expiresAt` is between 23h-25h from now
  (the 1-hour poll window ensures each sub gets notified exactly once)
- "Expired" notification: only send if `expiresAt` is between now-1h and now
  (catches subs that expired in the last polling interval)

No new DB columns needed — the time-window approach handles dedup.

---

## Bot `/subscribe` Command Flow

```
User sends /subscribe
  → Bot replies with inline keyboard:
    [Scanner Pro — 250⭐/mo]
    [Whale Tracker — 250⭐/mo]
    [All Access — 400⭐/mo]
    [View Annual Plans (save 20%)]
  → User taps a button
  → Bot creates invoice link + sends invoice via sendInvoice()
  → Telegram native Stars payment UI appears
  → Payment completes → same successful_payment handler fires
```

---

## Security Considerations

- Payload validation in `pre_checkout_query`: verify userId exists, tier is valid
- `telegram_payment_charge_id` dedup: check before upserting (prevent double-credit on retry)
- Invoice link created server-side only — never trust tier/amount from frontend
- `expiresAt` set server-side on payment confirmation — never from client
- Subscription status checked from DB on every protected request (existing pattern in scan.ts/tracker.ts)

---

## What Does NOT Change

- Prisma schema — `Subscription` model already has `tier`, `expiresAt`, `userId`
- Tier enforcement logic — `scan.ts` and `tracker.ts` already check tiers correctly
- Admin `set-tier` — still works for manual overrides/comp tiers
- Fee collection — 0.5% swap fee unaffected (swaps stay unlimited for all tiers)

---

## Implementation Order

1. `src/bot/handlers/payment.ts` — payment event handlers
2. `src/bot/index.ts` — register handlers + add `/subscribe` command
3. `src/bot/commands/start.ts` — export `getBotInstance()`
4. `src/api/routes/subscribe.ts` — invoice + subscription status endpoints
5. `src/api/server.ts` — mount subscribe router
6. `src/subscription/expiry.ts` — background expiry poller
7. `src/app.ts` — start expiry poller
8. `webapp/src/lib/api.ts` — add API functions
9. `webapp/src/components/UpgradeModal.tsx` — upgrade UI
10. `webapp/src/components/ScanPanel.tsx` — upgrade button on limit
11. `webapp/src/components/TrackerPanel.tsx` — upgrade button on limit
12. `webapp/src/components/SettingsPanel.tsx` — subscription section
13. `webapp/src/styles/index.css` — modal styles
14. CLAUDE.md — update docs (fix false claims, add subscription docs, changelog)

---

## Testing

- `npm run test:smoke` — existing tests still pass (no schema changes)
- Manual test: `/subscribe` in bot → verify invoice appears
- Manual test: hit scan limit → verify upgrade button opens modal → verify invoice
- Manual test: payment completes → verify DB subscription upserted → verify limits lifted
- Manual test: expiry notification → set expiresAt to 23h from now → wait for poller → verify bot message

---

## Deployment

1. Merge to `main`
2. VPS: `git pull origin main` → `npm run build` → `pm2 restart`
3. Frontend: Vercel auto-deploys
4. No `npx prisma db push` needed (no schema changes)
5. No new env vars needed
