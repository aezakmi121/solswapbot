# SECURITY.md — Threat Model & Security Rules

## Fundamental Security Guarantee

**We never hold user funds.** This single architectural decision eliminates the most catastrophic attack vector (custodial key theft). Everything in this document operates within that constraint.

---

## Threat Model

### Threats We Are IMMUNE To (By Architecture)

| Threat | Why We're Safe |
|--------|---------------|
| Private key theft | We never generate, request, or store private keys |
| Database breach → fund drain | Our DB has wallet addresses (public info) — no keys |
| Server compromise → fund drain | Server has no signing authority over user funds |
| Smart contract exploit | We have no smart contracts |
| Internal bad actor draining users | Technically impossible — we can't move user funds |

This is the entire reason we chose non-custodial. Banana Gun ($980K exploit), Maestro (exploit), Unibot (exploit) — all custodial bots. We sidestep the entire attack class.

---

### Threats We Must Actively Defend Against

#### 1. Bot Token Theft (HIGH PRIORITY)
**What it is:** Someone steals your `TELEGRAM_BOT_TOKEN` and runs a parallel bot pretending to be yours.
**Impact:** They intercept users and could direct them to malicious transactions.
**Mitigations:**
- Store bot token only in `.env` — never in code, never in logs
- Never commit `.env` to Git (`.gitignore` must cover it)
- Rotate bot token immediately via @BotFather if you suspect exposure
- Use BotFather's "Confirm domain" setting to restrict where bot can be embedded

#### 2. Fake Bot Impersonation (HIGH PRIORITY)
**What it is:** Attacker creates `@YourSwapBotFake` and promotes it as yours.
**Impact:** Users deposit into attacker's custodial bot thinking it's yours.
**Mitigations:**
- Get a verified/recognizable bot username — register it early
- Always publish official bot link from your own channels only
- Pin official bot link in your Telegram announcement channel
- In your bot's description, warn: "We will never DM you first"
- Consider adding bot username verification in `/start` message

#### 3. Malicious Transaction Injection (MEDIUM)
**What it is:** Bug in our code causes us to construct a transaction that isn't what the user expects — e.g., draining more tokens than quoted.
**Impact:** User signs a bad transaction, losing funds.
**Mitigations:**
- Always display the full quote (input amount, output amount, fee, slippage) before showing the sign button
- Validate all amounts are within expected ranges before constructing transaction
- Set conservative slippage defaults (0.5% — adjustable by user up to 2%)
- Use Jupiter's `onlyDirectRoutes` option for large amounts to reduce complexity
- Add a confirmation step — never construct+sign in one click

#### 4. Phishing Links in Bot (MEDIUM)
**What it is:** If we ever accept user-provided text that we echo back, attacker could inject a malicious link.
**Impact:** Users click a malicious link thinking it came from the bot.
**Mitigations:**
- NEVER echo back raw user input in bot messages
- Always sanitize and validate before displaying: only show formatted values (numbers, truncated addresses)
- Use Grammy's HTML/Markdown parse modes carefully — escape user inputs

#### 5. Rate Limit Abuse / DoS (MEDIUM)
**What it is:** Attacker floods bot with requests to exhaust Jupiter API limits or crash the server.
**Impact:** Bot becomes unavailable for real users.
**Mitigations:**
- Per-user rate limiting on all commands (see ARCHITECTURE.md)
- Global rate limiting: reject more than 100 requests/second total
- Jupiter API has its own rate limits (~600 req/min) — our per-user limits keep us well under

#### 6. Referral Code Abuse (LOW)
**What it is:** Bot farms create thousands of accounts to generate fake referral activity.
**Impact:** Fake referral earnings that you'd need to pay out.
**Mitigations:**
- Payouts are manual initially — you review before sending
- Require at least 1 confirmed swap before any referral earnings are counted
- Flag accounts with suspiciously high referral counts for review
- Consider requiring a minimum account age before payout eligibility

#### 7. RPC Endpoint Manipulation (LOW)
**What it is:** If using a compromised or unreliable RPC, responses could be manipulated.
**Impact:** Incorrect data shown to users, failed transaction submissions.
**Mitigations:**
- Use a dedicated, reputable RPC provider (Helius or QuickNode — NOT public endpoints)
- Validate RPC responses before trusting them
- Implement retry logic with exponential backoff on RPC failures

---

## Security Rules (Non-Negotiable in Code)

```
RULE 1: Never log sensitive data
- Never log wallet private keys (we don't have them, but just in case)
- Never log the full bot token
- Never log user swap amounts in plain text at DEBUG level in production
- Log transaction signatures (public) but not private details

RULE 2: Validate all inputs
- Every wallet address: must pass Solana PublicKey validation
- Every token mint address: must be a valid Solana public key
- Every amount: must be a positive number, within reasonable bounds
- Every command argument: length-limited, no special characters

RULE 3: Environment separation
- .env is NEVER committed to Git
- Production .env lives only on the VPS
- Development .env uses devnet values only
- Never use production credentials in development

RULE 4: Dependency security
- Run `npm audit` before each deployment
- Pin major versions in package.json (no ^)
- Review changelogs before major dependency updates
- No dependencies with known critical CVEs

RULE 5: Server hardening (VPS)
- SSH key authentication only (disable password login)
- UFW firewall: only ports 22 (SSH), 443 (HTTPS if needed) open
- Keep Ubuntu packages updated (unattended-upgrades enabled)
- No root login via SSH
- Bot runs as a non-root user

RULE 6: Database security
- SQLite file permissions: 600 (owner read/write only)
- No sensitive data in swap records beyond what's needed
- Daily encrypted backup of SQLite file to separate location
- Prisma parameterized queries only (never raw SQL string building)
```

---

## Incident Response Plan

If something goes wrong:

### Step 1: Immediate Containment (< 5 minutes)
```bash
# Stop the bot immediately
pm2 stop solana-swap-bot

# If bot token is compromised, revoke via BotFather immediately
# Open Telegram → @BotFather → /mybots → Your bot → API Token → Revoke
```

### Step 2: Assess (< 30 minutes)
- Check server access logs: `cat /var/log/auth.log`
- Check bot logs: `pm2 logs solana-swap-bot`
- Check if any unexpected outgoing transactions from fee wallet
- Determine scope: what was accessed?

### Step 3: Communicate
- Post in your bot's announcement channel immediately
- Be transparent: "We've detected an issue and paused the bot while investigating"
- Do NOT claim everything is fine before you've investigated
- Never say "no funds were lost" before you've confirmed it

### Step 4: Fix and Review
- Patch the vulnerability
- Security review of related code
- Have someone else review the fix before redeploying
- Consider a paid security audit if the vulnerability was significant

### Step 5: Post-Mortem
- Write a public post-mortem after the incident
- This builds trust — Banana Gun's reputation mostly survived because they refunded and published a detailed post-mortem
- Document what happened, what the impact was, how you fixed it, and what you changed to prevent recurrence

---

## Security Audit Plan

**Pre-launch (MVP):** Manual code review using this checklist:
- [x] No private keys handled anywhere — verified, non-custodial throughout
- [x] All inputs validated with Zod — Jupiter quote/swap responses use Zod schemas (`src/jupiter/quote.ts`)
- [x] Rate limiting active on all commands — Grammy middleware (`src/bot/middleware/rateLimit.ts`)
- [x] No secrets in code or logs — bot token, RPC URL only in `.env`
- [x] `.env` not in Git — `.gitignore` covers it
- [x] Phantom deeplinks constructed correctly — URL-encoded params, no user injection (`src/solana/phantom.ts`)
- [x] Jupiter API responses validated before use — Zod `.parse()` on all Jupiter responses

**At 100 DAU:** Consider a peer review from a developer you trust

**At 500 DAU / $5K MRR:** Budget for a professional security audit (~$3,000–$8,000). This is non-negotiable before launching sniping or copy-trading features.

**After any major feature addition:** Re-run the manual checklist

---

## What Makes Us More Secure Than Custodial Bots

The custodial bot exploit pattern:
1. Attacker finds vulnerability (SQL injection, command injection, API key exposure)
2. Attacker gains access to the key storage
3. Attacker drains all user wallets
4. Millions of dollars lost

Our non-custodial pattern:
1. Attacker finds vulnerability
2. Attacker gains access to our server
3. Attacker finds: a list of Telegram IDs, public wallet addresses, and swap history
4. None of that moves money
5. Worst case: data breach → notify users, rotate credentials, resume

This is why non-custodial was the right call. The security ceiling for us is fundamentally higher.
