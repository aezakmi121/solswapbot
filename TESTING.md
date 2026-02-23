# TESTING.md — How to Test SolSwap Bot

## Quick Answers

**Can we test on Solana devnet?** Partially. The bot framework, commands, DB, and wallet operations work on devnet. However, **Jupiter only works on mainnet** — there is no devnet Jupiter API.

**Can we test the full swap flow?** Yes, but on mainnet with tiny amounts ($0.01–$0.10 swaps). This is standard practice for Solana swap bots.

---

## Testing Strategy

### Layer 1: Bot Commands + DB (devnet — free)

Tests: `/start`, `/connect`, `/wallet`, `/referral`, `/history`, `/help`

These commands only need:
- A Telegram bot token (free from @BotFather)
- A Solana devnet RPC (free public endpoint)
- A devnet wallet (create with `solana-keygen new`)

**Setup:**
```bash
# 1. Create a test bot via @BotFather on Telegram
#    Message @BotFather → /newbot → name it "SolSwap Test Bot"
#    Save the token

# 2. Create a devnet wallet
solana-keygen new --outfile ~/.config/solana/devnet-fee-wallet.json
solana config set --url devnet
solana address  # This is your FEE_WALLET_ADDRESS for testing

# 3. Get free devnet SOL
solana airdrop 2   # Get 2 SOL on devnet (free)

# 4. Configure environment
cp .env.devnet .env
# Edit .env — fill in TELEGRAM_BOT_TOKEN and FEE_WALLET_ADDRESS

# 5. Run database migration
npx prisma migrate dev

# 6. Start the bot
npm run dev
```

**What to test:**
```
/start                           → Creates user in DB, shows welcome
/start ref_SOME_CODE             → Should ignore invalid referral codes gracefully
/connect <YOUR_DEVNET_ADDRESS>   → Should save wallet
/wallet                          → Should show devnet SOL balance
/referral                        → Should show referral link + 0 earnings
/history                         → Should show "No swaps yet"
/help                            → Should list all commands
/price SOL                       → Should fetch mainnet price (Jupiter API is mainnet)
```

### Layer 2: Jupiter Quotes (mainnet API — free, read-only)

Tests: `/price`, `/swap` (quote step only)

Jupiter's quote API is free to call and doesn't cost anything — it just returns price data. The `/swap` command up to the quote confirmation step works without spending any SOL.

**What to test:**
```
/price SOL       → Should show current SOL price
/price USDC      → Should show ~$1.00
/price BONK      → Should show small number
/swap 1 SOL USDC → Should show quote with fee breakdown
                    Then tap "Cancel" to abort
```

### Layer 3: Full Swap Flow (mainnet — costs real SOL, pennies)

Tests: `/swap` (full flow through Phantom signing)

For this you need:
- A mainnet Phantom wallet with ~0.01 SOL ($1–2 worth)
- The bot configured with mainnet RPC (Helius recommended)

**Setup for mainnet testing:**
```bash
# 1. Switch .env to mainnet values
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY  # Free tier: 100k requests/month
FEE_WALLET_ADDRESS=YOUR_MAINNET_FEE_WALLET

# 2. Run the bot
npm run dev
```

**What to test:**
```
# Minimum viable swap test (costs ~$0.01 in fees)
/swap 0.001 SOL USDC
→ Confirm the quote
→ Tap "Sign in Phantom"
→ Phantom opens, review the transaction
→ Sign it
→ Copy the transaction signature from Phantom
→ /status <PASTE_TX_SIGNATURE>
→ Wait for "Transaction confirmed!" message

# Verify in your fee wallet
# Check on Solscan that your fee wallet received 0.5% of the swap
```

### Layer 4: Referral Flow (any network)

```
# 1. User A starts the bot
/start
/referral   → Note the referral link

# 2. On a second Telegram account (or ask a friend):
# Click User A's referral link → Opens bot
/start      → Should be linked as referral

# 3. User B makes a swap
# After confirmed, User A checks:
/referral   → Should show 1 referral, earnings > $0
```

---

## Testing Checklist

### Pre-Launch Smoke Test

| # | Test | Command | Expected | Pass? |
|---|------|---------|----------|-------|
| 1 | New user onboarding | `/start` | Welcome message, referral code shown | |
| 2 | Returning user | `/start` again | "Welcome back" message | |
| 3 | Connect valid wallet | `/connect <valid-address>` | "Wallet connected!" | |
| 4 | Connect invalid wallet | `/connect abc123` | Error message | |
| 5 | View wallet balance | `/wallet` | Shows address + SOL balance | |
| 6 | Token price | `/price SOL` | Shows price in USD | |
| 7 | Unknown token | `/price FAKE` | Error message | |
| 8 | Swap quote | `/swap 0.001 SOL USDC` | Shows quote with fee | |
| 9 | Swap cancel | Tap "Cancel" | "Swap cancelled" | |
| 10 | Swap confirm | Tap "Confirm" | Phantom deeplink shown | |
| 11 | Swap history | `/history` | Shows recent swaps | |
| 12 | Referral link | `/referral` | Shows link + earnings | |
| 13 | Invalid command | `hello` | "Unknown command" | |
| 14 | Rate limiting | Spam `/price SOL` 10x | Should get rate limited | |
| 15 | Tx confirmation | `/status <signature>` | Tracks and reports result | |

### Edge Cases to Test

- `/swap 0 SOL USDC` → Should reject (amount must be positive)
- `/swap -1 SOL USDC` → Should reject
- `/swap 1 SOL SOL` → Should reject (same token)
- `/swap 1 FAKE USDC` → Should reject (unknown token)
- `/connect` with no address → Should show usage
- Very large swap amount → Should handle Jupiter error gracefully
- Expired quote (wait 60s, then confirm) → Should say "Quote expired"

---

## Devnet Limitations

| Feature | Works on Devnet? | Notes |
|---------|-----------------|-------|
| `/start`, `/connect`, `/wallet` | Yes | Full functionality |
| `/referral`, `/history` | Yes | Full functionality |
| `/price` | Yes* | Uses mainnet Jupiter price API |
| `/swap` (quote) | Yes* | Uses mainnet Jupiter API |
| `/swap` (sign + execute) | No | Phantom connects to mainnet |
| `/status` (tx polling) | Only mainnet | Needs real mainnet tx signature |
| Rate limiting | Yes | Works on any network |

*Jupiter API always returns mainnet data regardless of your RPC setting.

---

## Recommended Test Flow

```
Step 1: devnet bot commands     (free, ~10 min)
Step 2: mainnet price/quotes    (free, ~5 min)
Step 3: mainnet tiny swap       (costs ~$0.01, ~10 min)
Step 4: referral flow test      (free, ~10 min)
Step 5: edge cases              (~15 min)
```

Total testing time: ~50 minutes. Total cost: ~$0.02 in SOL.
