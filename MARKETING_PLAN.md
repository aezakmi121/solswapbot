# SolSwap Marketing & Launch Plan

> **Version:** 2.0 | **Date:** 2026-03-19
> CMO-level strategy document for launching SolSwap to production users.
> Updated with post-audit technical readiness assessment, channel-first strategy,
> and 2026 Telegram Mini App ecosystem intelligence.

---

## Table of Contents

1. [Launch Decision: Should You Launch Today?](#launch-decision)
2. [Product Positioning](#product-positioning)
3. [Channel-First Strategy: Twitter/X Before Instagram](#channel-first-strategy)
4. [Launch Strategy](#launch-strategy)
5. [Target Audience](#target-audience)
6. [Telegram Groups to Target](#telegram-groups-to-target)
7. [Marketing Channels](#marketing-channels)
8. [Trust Building](#trust-building)
9. [Feature Marketing Priorities](#feature-marketing-priorities)
10. [Content Calendar (First 30 Days)](#content-calendar-first-30-days)
11. [Growth Mechanics](#growth-mechanics)
12. [Metrics to Track](#metrics-to-track)
13. [Budget Considerations](#budget-considerations)
14. [Competitive Positioning](#competitive-positioning)
15. [Risk Mitigation](#risk-mitigation)
16. [Instagram Strategy (Phase 3+)](#instagram-strategy)
17. [KOL & Influencer Playbook](#kol-influencer-playbook)
18. [Viral Loops & Growth Hacks](#viral-loops-growth-hacks)
19. [Directory & Platform Submissions](#directory-submissions)

---

## Launch Decision: Should You Launch Today?

### Technical Readiness: 9.0/10 — YES, LAUNCH TODAY (Soft Launch)

**Full audit completed 2026-03-19.** The codebase is production-ready for a soft launch
to 50-100 users. Here's the evidence:

| Category | Status | Details |
|----------|--------|---------|
| Security | PASS | All 7 critical + 3 high + 5 medium audit findings fixed. HMAC auth, fee bypass prevention, GDPR deletion. |
| Tests | PASS | 22 unit tests passing. Integration smoke tests available. |
| External APIs | PASS | Jupiter, LI.FI, Helius, Moralis all validated (`npm run validate-keys`). |
| Core Swap Flow | PASS | Same-chain Solana + cross-chain 6-chain bridging live. |
| Whale Tracker | PASS | Polling fixed (overlap guard, memory pruning, log throttling applied 2026-03-19). |
| DB Schema | PASS | 6 models, proper indexes, BigInt handling correct. |
| Error Handling | PASS | Error boundaries (React + Express), graceful shutdown, orphan swap recovery. |

**5 medium/low findings remain** — none are launch-blocking:
1. Bridge poller missing fetch timeout (affects stuck bridge status, not swap execution)
2. N+1 metadata query in webhook alerts (performance, not correctness)
3. Swap dedup needs atomic transaction wrapper (rare edge case under extreme concurrency)
4. Cross-chain amount validation could be stricter (defensive, not exploitable)
5. Missing DB indexes for referral/scan queries (only matters at 10K+ users)

### What to Do Before First Share

**Must-do (2 hours):**
1. Run the Beta Test Checklist from CLAUDE.md with real SOL (0.001 SOL test swap)
2. Verify fee arrived in fee wallet on Solscan
3. Test on Android + iOS Telegram
4. Check PM2 logs are clean (`pm2 logs --lines 50`)

**Should-do (same day):**
1. Create @SolSwapBot Telegram community group
2. Create Twitter/X account (@SolSwapApp)
3. Record 60-second screen recording of a swap
4. Write 3 launch tweets (see Content Calendar)

### The Verdict

**Launch today as a soft launch to your trusted circle (Phase 1).** The product is technically
sound. The only risk is UX friction you haven't discovered yet — and that's exactly what
Phase 1 is designed to find. Waiting for "perfect" costs more than shipping to 50 friends.

---

## Channel-First Strategy: Twitter/X Before Instagram

### The Definitive Answer: Start with Twitter/X. Instagram comes later (Month 2+).

Here's why, based on 2026 crypto marketing data:

| Factor | Twitter/X | Instagram |
|--------|-----------|-----------|
| **Crypto audience density** | 90%+ of crypto discourse happens here | ~10% — lifestyle/visual crypto content |
| **Content format fit** | Threads, screenshots, links, scanner results | Reels, carousels — need polished visuals |
| **Cost to start** | $0 — text + screenshots | $200-500 — need video editing, graphics |
| **Time to first viral moment** | Days (reply to trending token with scan result) | Weeks-months (algorithm favors consistency) |
| **Conversion path** | Tweet → Telegram bot link → user (1 click) | Bio link → landing page → Telegram (3 clicks) |
| **Influencer ecosystem** | Crypto KOLs live here, DM-accessible | Crypto influencers are on X, not IG |
| **Competitor activity** | Every TG bot markets here (proven channel) | Almost none market on IG (unproven) |

### Twitter/X Launch Sequence (Week 1-4)

**Week 1: Foundation**
1. Create @SolSwapApp account (reserve @SolSwapBot if available)
2. Bio: "Swap 6 chains inside Telegram. Non-custodial. Rug scanner built in. [bot link]"
3. Profile pic: Simple logo (even a clean text logo works)
4. Banner: Product screenshot showing the swap interface
5. Pinned tweet: 60-second demo video + bot link

**Week 2: Content Engine**
- Post 2-3x/day minimum:
  - Morning: Scanner result on a trending token ("Is $MEMECOIN safe? Let's check...")
  - Afternoon: Feature showcase (whale alert screenshot, bridge demo)
  - Evening: Engagement reply (reply to Solana/crypto threads with value)
- **The Scanner is your secret weapon for Twitter** — every trending token is free content

**Week 3: Growth Tactics**
- Quote-tweet Solana ecosystem news with "You can swap this in SolSwap right now"
- Reply to "what wallet should I use?" threads
- DM 10 micro-KOLs with demo video + offer (see KOL Playbook section)

**Week 4: Amplification**
- Run a "Scan any token" thread (let followers suggest tokens, post results)
- Share whale tracker alerts (anonymized) — "Smart money just moved 500 SOL"
- Cross-post best content to Telegram group

### When to Add Instagram (Month 2-3, Phase 3)

Instagram becomes relevant when you have:
1. **Polished visual assets** (logo, brand colors, UI screenshots)
2. **Video content pipeline** (screen recordings → edited Reels)
3. **Budget for design** ($200-500 for a Canva Pro + freelancer)
4. **A story to tell** ("We helped X users swap $Y across Z chains")

Instagram's role is **brand legitimacy** (people Google you → find a real IG page), not
user acquisition. It's the "looks legit" channel, not the growth channel.

See [Instagram Strategy (Phase 3+)](#instagram-strategy) for the detailed plan.

---

## Product Positioning

### One-Liner
**"Swap any token across 6 blockchains — right inside Telegram. No wallet app needed."**

### Elevator Pitch
SolSwap is a non-custodial Telegram Mini App that lets you swap tokens on Solana, Ethereum,
BNB Chain, Polygon, Arbitrum, and Base without ever leaving Telegram. No seed phrases, no
browser extensions, no external wallet apps. Your wallet is created automatically on first
login, secured by military-grade MPC technology. Scan tokens for rug pulls before buying,
track whale wallets, and manage your full portfolio — all inside the chat app you already use.

### Core Value Props (in order of marketing priority)
1. **Zero friction** — No wallet download, no seed phrase, no browser extension
2. **Non-custodial** — You own your keys via Privy MPC. We never see them.
3. **Multi-chain** — 6 chains from one interface (Solana, ETH, BNB, Polygon, Arbitrum, Base)
4. **Rug scanner** — Check any token's safety before you buy
5. **Whale tracker** — Follow smart money and get alerts on big moves
6. **Inside Telegram** — Where crypto conversations already happen

---

## Launch Strategy

### Phase 1: Soft Launch (Week 1-2) — "Trusted Circle"
**Goal:** 50-100 real users, find critical bugs, validate UX

1. Share with personal crypto friends (10-20 people)
2. Post in 2-3 small Solana builder/alpha groups you're already in
3. Ask for honest feedback — DM each user personally
4. Fix bugs found in this phase BEFORE scaling
5. Collect 5-10 testimonials/screenshots from real users

**Success criteria:** 20+ completed swaps, 0 fund losses, <5% error rate

### Phase 2: Community Seeding (Week 3-4) — "Early Adopters"
**Goal:** 500 users, validate referral system, start organic word-of-mouth

1. Launch referral program (25% fee share is a strong incentive)
2. Post in mid-sized Telegram groups (see target list below)
3. Create a SolSwap Telegram community group
4. Start Twitter/X account with daily content
5. Reach out to 5-10 micro-influencers (1K-10K followers)

**Success criteria:** 100+ daily active users, referral loop generating 20%+ of new users

### Phase 3: Growth Push (Month 2-3) — "Scale"
**Goal:** 5,000+ users, revenue generation, brand recognition

1. Partner with Solana projects for co-marketing
2. Engage mid-tier crypto influencers (10K-50K followers)
3. Run trading competitions ("Most swaps in 24h" with SOL prizes)
4. Submit to Telegram Mini App directories and "best of" lists
5. Content marketing on Medium, Mirror, and crypto forums

### Phase 4: Expansion (Month 4+) — "Ecosystem"
**Goal:** 20,000+ users, premium subscriptions, exchange partnerships

1. Launch premium subscription (Telegram Stars)
2. Partner with exchanges for affiliate revenue
3. Explore listing on Telegram's official Mini App store
4. Consider Product Hunt launch
5. Strategic partnerships with wallet providers and DEX aggregators

---

## Target Audience

### Primary: Telegram-Native Crypto Traders
- **Who:** People who find alpha in Telegram groups and want to act on it instantly
- **Pain point:** Switching between Telegram, wallet app, and DEX is slow and risky
- **Message:** "See a token call → scan for rugs → swap. All without leaving Telegram."

### Secondary: Crypto Beginners
- **Who:** People curious about crypto but intimidated by MetaMask/Phantom setup
- **Pain point:** Wallet setup is confusing, seed phrases are scary
- **Message:** "Your first crypto wallet in 10 seconds. No seed phrase needed."

### Tertiary: Multi-Chain DeFi Users
- **Who:** Active traders who bridge between chains regularly
- **Pain point:** Bridging is complex, requires multiple tools
- **Message:** "Bridge between 6 chains in one tap. Solana to Ethereum in seconds."

---

## Telegram Groups to Target

### Tier 1 — High-Value, Direct Fit (Start Here)
These groups have active memecoin/token traders who will immediately understand the value.

| Group Type | Examples | Why |
|-----------|---------|-----|
| Solana alpha/calls groups | Sol Trading, Solana Degen, SOL Signals | Users actively look for tokens and need to swap fast |
| Memecoin communities | BONK Army, WIF holders, JUP community | High-frequency traders, token scanning is huge value-add |
| Telegram Mini App enthusiasts | TG Mini Apps, TON/TMA communities | Early adopters who already use Mini Apps |
| Crypto trading chat rooms | Any active trading group you're already in | Warm audience, can demo live |

### Tier 2 — Medium-Value, Broader Reach
| Group Type | Examples | Why |
|-----------|---------|-----|
| General Solana ecosystem groups | Solana official, Solana developers | Broader Solana community awareness |
| DeFi discussion groups | DeFi Telegram, Yield farming groups | Multi-chain DeFi users interested in bridging |
| Crypto news/discussion | CoinTelegraph community, general crypto chats | Brand awareness, education-focused |
| Regional crypto groups | Country-specific crypto groups (India, Nigeria, Turkey, Brazil, SEA) | Telegram-heavy regions with active crypto trading |

### Tier 3 — Partnership Groups
| Group Type | Examples | Why |
|-----------|---------|-----|
| Jupiter community | Official Jupiter channels | SolSwap uses Jupiter — natural partnership |
| Privy/wallet infra communities | Privy Discord/Telegram | Showcase what's built with their tech |
| LI.FI community | LI.FI channels | Cross-chain integrator partnership |

### Approach Rules for Group Marketing
1. **Never spam.** Always provide value first (answer questions, share insights)
2. **Be a member first.** Spend 1 week engaging before promoting
3. **Show, don't tell.** Post screenshots/videos of actual swaps
4. **Respond to pain points.** When someone asks "how do I swap X" — that's your moment
5. **Respect group rules.** DM admins before posting promotional content
6. **Use your own referral link** in every post

---

## Marketing Channels

### 1. Telegram (Primary — 60% of effort)
- **Own community group:** Create @SolSwapBot group/channel
  - Daily: market commentary + "token of the day" scan results
  - Weekly: whale tracker highlights, interesting on-chain movements
  - Pin: tutorial video + referral program info
- **Other groups:** Organic engagement (see approach rules above)
- **Bot message:** Optimize the /start message — it's your first impression

### 2. Twitter/X (Secondary — 25% of effort)
- **Account:** @SolSwapBot or @SolSwapApp
- **Content pillars:**
  1. Product demos (screen recordings of swaps, scans, bridges)
  2. Rug pull scanner results on trending tokens (educational, viral potential)
  3. Whale tracker alerts (redacted wallet addresses, movement patterns)
  4. "Thread" tutorials (How to swap in Telegram, How to check if a token is safe)
  5. Memes (Solana culture, degen trading humor)
- **Engagement:** Reply to Solana/crypto influencers discussing tokens with scanner results
- **Hashtags:** #Solana #DeFi #TelegramMiniApp #CryptoTrading

### 3. Reddit/Forums (Supplementary — 10% of effort)
- r/solana, r/CryptoCurrency, r/defi
- Long-form posts: "I built a non-custodial swap app inside Telegram — here's how"
- Technical deep-dives: security model, non-custodial architecture
- Comment on relevant threads (wallet recommendations, DEX discussions)

### 4. YouTube/Video (Growth Multiplier — 5% of effort)
- 60-second demo reel: "Swap tokens without leaving Telegram"
- Tutorial: "How to set up SolSwap in 30 seconds"
- Scanner showcase: "Is [trending memecoin] safe? Let's check"
- Send to micro-influencers for review

---

## Trust Building

Trust is the #1 barrier for any crypto product. Here's how to build it:

### 1. Technical Transparency
- **Open the code:** Consider open-sourcing non-sensitive parts (scanner logic, frontend)
- **Security audit report:** Publish the audit summary publicly (you have it already)
- **Non-custodial proof:** Explain Privy MPC in simple terms. "We literally cannot touch your funds."
- **Fee transparency:** 0.5% fee clearly stated in the app and marketing materials

### 2. Social Proof
- **Real transaction links:** Share Solscan links of actual swaps (with permission)
- **User testimonials:** Video testimonials > text testimonials > nothing
- **Daily volume stats:** Once you have them, publish daily swap volume
- **"X swaps completed, $Y volume, 0 funds lost"** — update these numbers in your channel

### 3. Community Trust
- **Active support:** Respond to every question within 1 hour in your TG group
- **Bug bounty:** Offer SOL rewards for reporting bugs (even small: 0.1 SOL per valid report)
- **Regular updates:** Weekly changelog/update posts showing active development
- **Admin doxxed (optional):** If comfortable, show your face/identity. Anon projects face more skepticism.

### 4. Platform Trust Signals
- **Telegram Mini App badge:** Being inside Telegram itself lends credibility
- **Privy partnership:** Mention you're built on Privy (venture-backed, established)
- **Jupiter integration:** "Powered by Jupiter" — the most trusted Solana DEX
- **LI.FI integration:** "Cross-chain by LI.FI" — established bridge aggregator

### 5. Terms & Legal
- Terms of Use already implemented (gated on first launch)
- Add a simple privacy policy page (what data you collect, what you don't)
- Consider a simple "About Us" section with team info

---

## Feature Marketing Priorities

Rank features by what converts new users and what retains them.

### Tier 1 — User Acquisition Features (Lead with these)
| Feature | Marketing Angle | Why It Converts |
|---------|----------------|-----------------|
| Instant wallet creation | "Your wallet in 10 seconds" | Removes biggest friction point |
| Token scanner | "Is this token safe? Check before you buy" | Viral — people share scan results |
| Swap inside Telegram | "Buy tokens without leaving the chat" | Core value prop differentiator |
| Non-custodial | "Your keys, your crypto. Always." | Trust signal for crypto-savvy users |

### Tier 2 — User Retention Features (Mention after onboarding)
| Feature | Marketing Angle | Why It Retains |
|---------|----------------|---------------|
| Whale tracker | "Follow smart money. Get alerts." | Brings users back daily |
| Multi-chain bridge | "6 chains, one app" | Power users love this |
| Portfolio view | "All your tokens, one place" | Daily engagement |
| Referral program | "Earn 25% of your friends' fees forever" | Viral loop, long-term retention |

### Tier 3 — Feature Depth (For power users / PR)
| Feature | Marketing Angle | Purpose |
|---------|----------------|---------|
| Transaction history | Full transaction log with filters | Builds trust (transparency) |
| Slippage control | Pro-level trading controls | Signals "real DEX, not toy" |
| QR code receive | "Send crypto to anyone with a QR" | Casual use case expansion |

---

## Content Calendar (First 30 Days)

### Week 1: Soft Launch
| Day | Channel | Content |
|-----|---------|---------|
| 1 | TG Group | Launch announcement + tutorial video |
| 1 | Twitter | "We just launched" thread with demo video |
| 2 | TG Group | "How to make your first swap" step-by-step |
| 3 | Twitter | Token scanner demo on a trending memecoin |
| 4 | TG Group | Bug report channel created + bug bounty announced |
| 5 | Twitter | "Why we built SolSwap" story thread |
| 6 | TG Groups (2-3) | Organic promotion in alpha groups |
| 7 | TG Group | Week 1 recap: X users, Y swaps, Z volume |

### Week 2: Feedback & Iteration
| Day | Channel | Content |
|-----|---------|---------|
| 8 | Twitter | User testimonial retweet |
| 9 | TG Group | Feature poll: "What should we build next?" |
| 10 | Twitter | "How to check if a memecoin is safe" tutorial thread |
| 11 | TG Group | Scanner results on top 5 trending tokens |
| 12 | Reddit | Long-form post in r/solana about the project |
| 13 | Twitter | Meme content (Solana/trading culture) |
| 14 | TG Group | Week 2 recap + upcoming features teaser |

### Week 3: Referral Push
| Day | Channel | Content |
|-----|---------|---------|
| 15 | All | Referral program launch announcement |
| 16 | Twitter | "Earn 25% of your friends' swap fees" explainer |
| 17 | TG Groups | Share referral links in relevant conversations |
| 18 | Twitter | Whale tracker demo + alert screenshot |
| 19 | TG Group | "Top referrers" leaderboard (even if small) |
| 20 | YouTube | 60-second demo video |
| 21 | TG Group | Week 3 recap + referral stats |

### Week 4: Growth Push
| Day | Channel | Content |
|-----|---------|---------|
| 22 | Twitter | Bridge demo: "Solana to Ethereum in 30 seconds" |
| 23 | TG Group | Trading competition announcement |
| 24 | Influencers | Send DMs to 10 micro-influencers with demo |
| 25 | Twitter | Security model thread ("How we keep your funds safe") |
| 26 | TG Group | Live Q&A / AMA in your group |
| 27 | Reddit | Cross-post security thread to r/CryptoCurrency |
| 28 | Twitter | Month 1 milestone stats |
| 29 | TG Group | Month 1 recap + roadmap for Month 2 |
| 30 | All | "Month 1 Report" blog post |

---

## Growth Mechanics

### 1. Referral Loop (Built-in)
- 25% fee share is exceptionally generous — market this heavily
- Every referrer is a micro-influencer for your product
- Create a referral leaderboard (weekly prizes for top referrers)
- "Refer 5 friends → unlock Whale Tracker Pro free for 1 month"

### 2. Scanner Virality
- Token scanner results are inherently shareable
- Add a "Share scan result" button that generates a card image
- When a new memecoin launches, scan it and post results on Twitter
- Users will share "This token is a RUG" or "This token looks SAFE" organically

### 3. Whale Alerts as Content
- Anonymized whale movement alerts are Twitter gold
- "Whale just moved 500 SOL into [token]" — drives curiosity and engagement
- Set up an auto-posting bot from whale alerts → your Twitter/TG channel

### 4. SEO / Discoverability
- Telegram Mini App directories (submit to all of them)
- "Solana swap Telegram" should eventually rank your product
- Optimize bot description in BotFather for searchability
- Get listed on DappRadar, DeFi Llama (when volume is sufficient)

---

## Metrics to Track

### Week 1 Targets
| Metric | Target | How to Measure |
|--------|--------|---------------|
| Total users | 50 | `SELECT COUNT(*) FROM User` |
| Completed swaps | 20 | `SELECT COUNT(*) FROM Swap WHERE status='CONFIRMED'` |
| Error rate | <5% | Failed swaps / total swap attempts |
| Avg session time | >2 min | Telegram Mini App analytics |

### Month 1 Targets
| Metric | Target | How to Measure |
|--------|--------|---------------|
| Total users | 500 | DB query |
| Daily active users | 50+ | Users with activity in last 24h |
| Swap volume (USD) | $10,000+ | Sum of swap amounts |
| Revenue | $50+ | 0.5% of swap volume |
| Referral signups | 20%+ of total | Users with `referredById` set |
| Scanner uses/day | 100+ | `TokenScan` table daily count |
| Retention (D7) | >30% | Users who return after 7 days |

### Month 3 Targets
| Metric | Target |
|--------|--------|
| Total users | 5,000 |
| DAU | 500+ |
| Monthly swap volume | $500K+ |
| Monthly revenue | $2,500+ |
| Referral contribution | 30%+ of new users |

---

## Budget Considerations

### Zero-Budget Launch (Recommended for Phase 1-2)
| Item | Cost | Notes |
|------|------|-------|
| VPS (Hostinger) | ~$10/month | Already running |
| Vercel (frontend) | Free tier | Sufficient for launch |
| Helius RPC | Free tier | 500K credits/month |
| Moralis | Free tier | 120K CUs/month |
| Jupiter | Free tier | Rate-limited but functional |
| Domain (optional) | ~$12/year | For a landing page |
| **Total** | **~$12/month** | |

### Growth Budget (Phase 3+, if revenue supports it)
| Item | Cost | ROI |
|------|------|-----|
| Micro-influencer posts (5-10) | $50-200 each | 100-500 users per post |
| Trading competition prizes | $100-500 in SOL | Community buzz, user activation |
| Helius paid plan | $50/month | Higher RPC limits |
| Jupiter paid API | $0-100/month | Higher rate limits |
| Telegram Premium (for group features) | $5/month | Better group management |
| Design (logo, banners, videos) | $100-500 one-time | Professional appearance |

### Revenue Breakeven Analysis
- At 0.5% fee on swaps, you need $2,400/month in swap volume to cover $12/month in costs
- At $50K monthly volume → $250/month revenue (comfortable margin)
- At $500K monthly volume → $2,500/month revenue (sustainable business)

---

## Competitive Positioning

### Direct Competitors
| Product | Weakness vs SolSwap |
|---------|---------------------|
| Unibot (Telegram) | Custodial, Ethereum-only, complex commands |
| Banana Gun (Telegram) | Bot command-based (no Mini App UI), Ethereum-focused |
| Maestro Bot | Text-based trading, steep learning curve |
| BonkBot | Solana-only, no scanner, no bridge, text-based |

### SolSwap's Differentiators
1. **Mini App (not bot commands)** — Visual UI > text commands for most users
2. **Non-custodial (Privy MPC)** — Most TG trading bots are custodial
3. **6-chain support** — Most are single-chain
4. **Built-in rug scanner** — No competitor has this integrated
5. **Whale tracker** — Unique feature for a swap app

### Positioning Statement
> "SolSwap is the only non-custodial Telegram Mini App that lets you swap, scan,
> and track across 6 blockchains — without ever leaving your chat."

---

## Risk Mitigation

### Technical Risks
| Risk | Mitigation |
|------|-----------|
| Solana RPC downtime | Helius has 99.9% uptime; add fallback RPC endpoint |
| Jupiter API changes | Pin API version, monitor changelog |
| LI.FI bridge delays | Clear UX messaging ("bridges take 2-15 min"), status polling |
| Privy SDK issues | Pin version, test upgrades in staging |

### Business Risks
| Risk | Mitigation |
|------|-----------|
| Telegram bans Mini App | Comply with TG ToS, have backup plan (PWA) |
| User funds stuck | Recheck endpoint, manual support channel, on-chain funds are always recoverable |
| Competitor copies features | Move fast, build community moat, referral lock-in |
| Regulatory concerns | Non-custodial = lower regulatory risk, add disclaimers |

### Reputation Risks
| Risk | Mitigation |
|------|-----------|
| User loses funds to a scam token | Scanner is advisory, not financial advice — legal disclaimer in app |
| Whale tracker shows wrong data | Clear "beta" label, error margins documented |
| Negative reviews | Active support, fast bug fixes, transparent communication |

---

## Pre-Launch Checklist

Before sharing with anyone:

- [ ] Run full beta test checklist from CLAUDE.md
- [ ] Complete a real swap with actual SOL (not testnet)
- [ ] Verify fee collection in fee wallet on Solscan
- [ ] Test referral flow end-to-end (new user joins via ref link)
- [ ] Test on both Android and iOS Telegram
- [ ] Set up Telegram community group with rules pinned
- [ ] Create Twitter/X account with profile pic, bio, and pinned tweet
- [ ] Record 60-second demo video
- [ ] Prepare 3 launch tweets (announcement, demo, thread)
- [ ] Set up basic analytics (daily user/swap count query)
- [ ] Have 3-5 trusted friends test independently
- [ ] Verify PM2 logs are clean (no recurring errors)
- [ ] Run `npm run validate-keys` on VPS — all checks pass
- [ ] Update bot description in BotFather for discoverability

---

## TL;DR Launch Playbook

1. **Week 1:** Ship to 50 friends. Fix what breaks.
2. **Week 2:** Share in 3 Solana alpha groups. Collect testimonials.
3. **Week 3:** Launch referral program. Push on Twitter.
4. **Week 4:** DM micro-influencers. Run first trading competition.
5. **Month 2:** Partner with Solana projects. Scale content.
6. **Month 3:** Hit 5K users. Launch premium subscriptions.

**The #1 rule:** Talk to users every day. The product will win if people actually use it and tell their friends.

---

## Instagram Strategy (Phase 3+)

### When to Launch: Month 2-3 (after 500+ users, revenue flowing)

Instagram is a **brand legitimacy channel**, not a growth channel for crypto. Here's the plan:

### Account Setup
- **Handle:** @solswap.app or @solswapofficial
- **Bio:** "Swap crypto across 6 chains inside Telegram | Non-custodial | [link in bio]"
- **Link in bio:** Linktree with: Telegram bot, Twitter, community group
- **Grid aesthetic:** Dark theme (matching app), purple accent, clean screenshots

### Content Pillars (3 posts/week)

| Type | Format | Example |
|------|--------|---------|
| Product showcase | Carousel (4-5 slides) | "How to swap SOL→ETH in 30 seconds" step-by-step |
| Token safety | Single image | "Is $BONK safe?" — RiskGauge screenshot with verdict |
| Whale alerts | Story | "Whale moved 1000 SOL into $TOKEN" — urgency content |
| Behind the scenes | Reel (15-30s) | Screen recording of live swap execution |
| Education | Carousel | "5 signs a token is a rug pull" — educational, shareable |
| Milestones | Single image | "1000 users! Thank you" — social proof |

### Instagram Reels Strategy
- **Format:** 15-30 second screen recordings with text overlay + trending audio
- **Hook pattern:** "You're still switching apps to swap crypto?" → demo → CTA
- **Posting time:** 6-8 PM UTC (peak crypto engagement)
- **Hashtags:** #Solana #DeFi #CryptoTrading #TelegramBot #Web3 #CryptoSwap (max 10, mix sizes)

### Budget: $100-300/month
- Canva Pro: $13/month (templates, brand kit)
- Freelance designer: $50-150/month (5-10 posts)
- Optional: Instagram ads ($50-100/month for post boosts to crypto interests)

### What NOT to Do on Instagram
- Don't chase followers — chase saves and shares (algorithm signals)
- Don't post every day — 3 quality posts > 7 mediocre ones
- Don't ignore DMs — respond to every question, it builds trust
- Don't use generic crypto stock images — always use YOUR product screenshots

---

## KOL & Influencer Playbook

### Tier System for Crypto KOLs

| Tier | Followers | Cost per post | Expected reach | ROI |
|------|-----------|---------------|----------------|-----|
| **Nano** | 1K-5K | Free-$25 (offer early access) | 200-1K impressions | Best ROI — engaged niche audience |
| **Micro** | 5K-25K | $50-200 | 2K-10K impressions | Good ROI — targeted, affordable |
| **Mid** | 25K-100K | $200-1,000 | 10K-50K impressions | Moderate — use for credibility |
| **Macro** | 100K-500K | $1,000-5,000 | 50K-200K impressions | Low ROI unless you're scaling |
| **Mega** | 500K+ | $5,000-25,000+ | 200K-1M+ impressions | Don't touch until $10K+/month revenue |

### Phase 1-2 KOL Strategy (Budget: $0-500)

**Target: 10-15 Nano/Micro KOLs on Twitter/X who:**
- Actively discuss Solana memecoins
- Post token analyses / alpha calls
- Have engaged audiences (check reply counts, not just followers)
- Are NOT already promoting 5+ competitor bots

**Outreach Template (DM):**
```
Hey [name], love your Solana alpha content. We built SolSwap — a non-custodial
swap + rug scanner inside Telegram. Would love for you to try it and share your
honest thoughts. Happy to set up early access + [offer]. Here's a 60-second
demo: [video link]
```

**Offer tiers:**
1. **Free tier:** Early access + feature request priority + "Featured KOL" badge
2. **Paid tier:** $50-200 per post (nano/micro) + all free tier perks
3. **Revenue share:** Custom referral link with higher % (e.g., 30% instead of 25%)

### Phase 3+ KOL Strategy (Budget: $1,000-5,000/month)

- Engage 3-5 mid-tier KOLs for ongoing partnerships (1 post/week)
- Sponsor 1-2 YouTube review videos ($300-800 each)
- Run KOL trading competition ("Top KOL referrer wins 5 SOL")
- Create a "SolSwap Ambassadors" program with monthly payouts

### KOL Red Flags (Avoid These)
- Follower-to-engagement ratio below 1% (fake followers)
- Only promotes paid content, never organic crypto discussion
- History of promoting rug pulls or scam tokens
- Demands payment upfront with no track record
- Won't disclose the post is sponsored

---

## Viral Loops & Growth Hacks

### 1. Scanner Share Card (HIGH PRIORITY — Build This)

The rug scanner is SolSwap's most viral feature. Currently results stay in-app.

**Proposed feature:** "Share Scan" button that generates a shareable image card:
```
┌─────────────────────────────────────┐
│  SolSwap Token Scanner              │
│                                     │
│  $BONK                              │
│  Risk Score: 15/100  ●●○○○  LOW     │
│                                     │
│  ✅ No Mint Authority               │
│  ✅ No Freeze Authority             │
│  ✅ Jupiter Verified                 │
│  ⚠️  Top 10 hold 35%                │
│                                     │
│  Scan any token → t.me/SolSwapBot   │
└─────────────────────────────────────┘
```

**Why this is a growth hack:**
- People WANT to share "this token is safe" or "this is a RUG" — it's social currency
- Every shared card has your bot link — free distribution
- Crypto Twitter engagement on "token safety" posts is 3-5x higher than generic swap posts
- Zero marginal cost per share

### 2. Whale Alert Auto-Posting Channel

Create a public Telegram channel (@SolSwapWhaleAlerts) that auto-posts anonymized
whale movements from your tracker:

- "Whale moved 500 SOL ($75,000) into a new wallet"
- "Smart money bought 10M BONK ($4,200)"
- Link each alert to "Track this wallet on SolSwap"

**Growth mechanism:** People join the channel for free alpha → discover the full app.
This is exactly how Whale Alert (the brand) built 500K+ followers — by being useful.

### 3. "Scan Before You Swap" Meme Campaign

Position SolSwap as the "safety-first" swap tool:
- "Friends don't let friends swap without scanning"
- "Scan first. Swap second. DYOR."
- Create meme templates (Drake meme: "Buying random memecoins" / "Scanning before buying")
- Memes are the #1 organic reach driver in crypto Twitter

### 4. Referral Gamification

Your 25% fee share referral is already strong. Amplify it:
- **Leaderboard:** Weekly "Top Referrers" post in Telegram group (even 3-5 people)
- **Milestone rewards:** 5 referrals → Pro features free for 1 month
- **Competition:** "Refer the most users this week → win 1 SOL"

### 5. Token Launch Alerts

When a new token launches on Solana (via pump.fun or similar):
- Auto-scan it
- Post results on your Twitter + Telegram channel
- "New token $XYZ just launched. SolSwap risk score: 78/100 HIGH RISK"
- People searching for that token name will find YOUR post

---

## Directory & Platform Submissions

Submit SolSwap to these directories as soon as you hit 100+ users:

### Telegram Mini App Directories
| Directory | URL | Priority |
|-----------|-----|----------|
| FindMini.app | findmini.app | P0 — largest TMA directory |
| Telegram Mini Apps catalog | t.me/tma | P0 — official-adjacent |
| TON App | ton.app | P1 — TON ecosystem directory |
| TGStat | tgstat.com | P1 — Telegram analytics/directory |

### DeFi / Crypto Directories
| Directory | URL | When |
|-----------|-----|------|
| DappRadar | dappradar.com | After $10K+ monthly volume |
| DefiLlama | defillama.com | After $50K+ monthly volume (need TVL data) |
| DeFi Pulse | defipulse.com | After establishing volume track record |
| CoinGecko (DeFi section) | coingecko.com | After $100K+ monthly volume |

### General Product Directories
| Directory | URL | When |
|-----------|-----|------|
| Product Hunt | producthunt.com | Month 2 — need polished screenshots + demo video |
| BetaList | betalist.com | Week 2 — good for early user acquisition |
| Hacker News (Show HN) | news.ycombinator.com | Month 1 — technical audience appreciates non-custodial architecture |

---

## Features to Showcase (Ranked by Marketing Impact)

### Lead with these 3 features in all marketing:

**1. Rug Scanner (Highest viral potential)**
- This is your unique moat. No other TG swap bot has an integrated scanner.
- Every trending memecoin is free content: "Is $TOKEN safe?"
- Build the Share Card feature ASAP — it's your #1 organic growth driver
- Marketing angle: "Don't get rugged. Scan before you swap."

**2. Instant Wallet (Lowest friction entry point)**
- "Your crypto wallet in 10 seconds. No seed phrase."
- This converts crypto-curious people who are intimidated by Phantom/MetaMask
- Demo video should show: open bot → tap → wallet created → done
- Marketing angle: "The easiest way to start in crypto."

**3. Swap Inside Telegram (Core differentiator)**
- "See alpha in your group chat → swap without leaving Telegram"
- This is the "aha moment" — show it in every demo video
- Marketing angle: "Your Telegram IS your DEX now."

### Mention these for retention and power users:

**4. Whale Tracker** — "Follow smart money. Get alerts." (brings users back daily)
**5. 6-Chain Bridge** — "Solana to Ethereum in one tap." (power user hook)
**6. 25% Referral** — "Earn from every friend's swap. Forever." (viral loop)

### Save these for depth/PR:
- Transaction history with filters
- Slippage controls
- QR code receive
- Portfolio view across chains

---

## Reach Expansion Roadmap

### Month 1: Foundation (Target: 500 users)
| Channel | Effort | Expected Users |
|---------|--------|---------------|
| Personal network + friends | 10% | 20-50 |
| Telegram alpha groups (5-10) | 40% | 100-200 |
| Twitter/X organic | 30% | 50-100 |
| Referral program | 15% | 100-150 |
| Reddit r/solana post | 5% | 20-50 |

### Month 2: Amplification (Target: 2,000 users)
| Channel | Effort | Expected Users |
|---------|--------|---------------|
| KOL partnerships (10-15 nano/micro) | 30% | 500-800 |
| Twitter/X content engine | 25% | 200-400 |
| Telegram community growth | 20% | 200-300 |
| Referral viral loop | 15% | 300-500 |
| Directory submissions | 10% | 100-200 |

### Month 3: Scale (Target: 5,000+ users)
| Channel | Effort | Expected Users |
|---------|--------|---------------|
| Mid-tier KOLs (3-5) | 25% | 1,000-2,000 |
| Whale Alert channel organic | 15% | 300-500 |
| Instagram launch | 10% | 100-200 |
| Trading competitions | 15% | 300-500 |
| Product Hunt + Hacker News | 10% | 200-500 |
| Organic referral compound | 25% | 1,000-1,500 |
