# SETUP.md — Getting Started with Claude Code

## Step 1: Create Your GitHub Repo

```bash
# On your machine
mkdir solana-swap-bot
cd solana-swap-bot
git init
git branch -M main
```

## Step 2: Add These Documentation Files First

Copy all 5 documentation files into the project root:
- CLAUDE.md
- README.md
- ARCHITECTURE.md
- SECURITY.md
- API.md

Then commit them:
```bash
git add .
git commit -m "docs: add project documentation and CLAUDE.md context"
```

## Step 3: Create .gitignore

```bash
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
*.db
*.db-journal
.DS_Store
EOF

git add .gitignore
git commit -m "chore: add gitignore"
```

## Step 4: Open with Claude Code

```bash
# In your project directory
claude
```

Claude Code will automatically find and read CLAUDE.md on startup. You'll see it acknowledge the project context.

## Step 5: First Prompt to Claude Code

Once Claude Code is open, use this prompt to kick off the build:

```
Read CLAUDE.md, ARCHITECTURE.md, and API.md fully. 

Then scaffold the complete project structure as defined in CLAUDE.md. 
Create all directories and empty placeholder files first, then build in this order:
1. package.json with all dependencies
2. tsconfig.json
3. .env.example with all variables
4. prisma/schema.prisma with the full schema
5. src/config.ts with Zod validation of env vars
6. src/db/client.ts with Prisma singleton
7. src/app.ts entry point

Do not write any bot commands yet — just the foundation layer. 
After each file, confirm it compiles without TypeScript errors.
```

## Step 6: Iterative Building

After scaffolding, work through the build in sessions. Each session, Claude Code reads CLAUDE.md and knows exactly where you are. Suggested session breakdown:

**Session 2:** Jupiter API integration (`src/jupiter/`)
**Session 3:** Phantom deeplink generation (`src/solana/phantom.ts`)
**Session 4:** Bot commands — `/start`, `/wallet`, `/connect`
**Session 5:** Bot commands — `/swap` full flow
**Session 6:** Referral system
**Session 7:** Rate limiting + error handling
**Session 8:** Testing on devnet
**Session 9:** VPS deployment

## Step 7: Create Claude.ai Project

1. Go to claude.ai → Projects → New Project
2. Name it "SolSwap Bot"
3. In the project context, paste the contents of CLAUDE.md
4. Use this project for all architecture decisions, debugging, and planning
5. Use Claude Code (terminal) for actual code writing

This way: **claude.ai project = planning/decisions, Claude Code = building**.

---

## Prerequisites Checklist

Before starting:
- [ ] Node.js 20 installed (`node --version`)
- [ ] Claude Code installed (`claude --version`)
- [ ] Git installed and configured
- [ ] A Telegram account to create the bot via @BotFather
- [ ] A Solana wallet (Phantom) to receive fees
- [ ] A Helius account for RPC (free at helius.dev)
- [ ] A VPS account (Hetzner CX11 at ~$4/month, or DigitalOcean $6/month)

## @BotFather Setup (Do This Now)

1. Open Telegram → search `@BotFather`
2. Send `/newbot`
3. Choose a name: e.g., "SolSwap Trading Bot"
4. Choose a username: e.g., `@SolSwapTradingBot` (must end in 'bot')
5. Copy the token → put in `.env` as `TELEGRAM_BOT_TOKEN`
6. Send `/setdescription` → Add bot description
7. Send `/setcommands` → Add command list:
   ```
   start - Start the bot and connect your wallet
   swap - Swap tokens
   price - Get token price
   wallet - View your connected wallet
   referral - Your referral link and earnings
   history - Your swap history
   help - Show all commands
   ```
