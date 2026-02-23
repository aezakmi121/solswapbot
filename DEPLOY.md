# DEPLOY.md — Production Deployment Guide

## Overview

Deploy on a $5–10/month VPS running Ubuntu 22.04. PM2 keeps the bot alive indefinitely — it auto-restarts on crash, reboots, and memory leaks.

**Recommended providers:** Hetzner ($4.15/month CX22), DigitalOcean ($6/month), Vultr ($6/month)

---

## Step-by-Step Deployment

### 1. Provision VPS

```bash
# After creating Ubuntu 22.04 VPS, SSH in:
ssh root@YOUR_VPS_IP

# Create non-root user (never run bot as root)
adduser solbot
usermod -aG sudo solbot
su - solbot
```

### 2. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Should show v20.x
```

### 3. Install PM2

```bash
sudo npm install -g pm2
pm2 startup  # Follow the printed command to enable PM2 on boot
```

### 4. Clone and Build

```bash
cd ~
git clone YOUR_REPO_URL solswap-bot
cd solswap-bot
npm install --production=false  # Need devDeps for build
npm run build
```

### 5. Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
FEE_WALLET_ADDRESS=your_solana_wallet_address
NODE_ENV=production
DATABASE_URL=file:./data/prod.db
LOG_LEVEL=info
PLATFORM_FEE_BPS=50
REFERRAL_FEE_SHARE_PERCENT=25
```

**RPC Provider:** Get a free Helius API key at https://helius.dev (100k requests/month free tier). Do NOT use public `api.mainnet-beta.solana.com` in production.

### 6. Initialize Database

```bash
mkdir -p data
npx prisma migrate deploy
```

### 7. Start with PM2

```bash
# Create logs directory
mkdir -p logs

# Start the bot
pm2 start ecosystem.config.js

# Verify it's running
pm2 status
pm2 logs solswap-bot --lines 20

# Save PM2 process list (survives reboot)
pm2 save
```

### 8. Verify

1. Open Telegram, find your bot
2. Send `/start` — should get welcome message
3. Send `/price SOL` — should show current price
4. Check PM2: `pm2 status` should show `online`

---

## Running Indefinitely

PM2 handles everything:

| Scenario | What PM2 Does |
|----------|---------------|
| Bot crashes (unhandled error) | Auto-restarts with exponential backoff |
| VPS reboots | Auto-starts bot on boot (via `pm2 startup`) |
| Memory leak (>256MB) | Kills and restarts the process |
| Manual deploy | `pm2 restart solswap-bot` — zero downtime |

### Key PM2 Commands

```bash
pm2 status                    # Check bot status
pm2 logs solswap-bot          # Stream live logs
pm2 logs solswap-bot --lines 100  # Last 100 log lines
pm2 restart solswap-bot       # Restart after code changes
pm2 stop solswap-bot          # Stop the bot
pm2 monit                     # Real-time CPU/memory dashboard
```

---

## Updating (Deploying New Code)

```bash
cd ~/solswap-bot
git pull origin main
npm install
npm run build
npx prisma migrate deploy   # Apply any new migrations
pm2 restart solswap-bot
pm2 logs solswap-bot --lines 10   # Verify startup
```

---

## Server Hardening (Do This Once)

```bash
# 1. Firewall — only allow SSH
sudo ufw allow OpenSSH
sudo ufw enable

# 2. Disable root SSH login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# 3. Enable automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# 4. Set database file permissions
chmod 600 ~/solswap-bot/data/prod.db
```

---

## Database Backups

```bash
# Add to crontab: daily backup at 3 AM
crontab -e

# Add this line:
0 3 * * * cp ~/solswap-bot/data/prod.db ~/backups/prod-$(date +\%Y\%m\%d).db && find ~/backups -mtime +30 -delete

# Create backup directory
mkdir -p ~/backups
```

---

## Monitoring

### Option 1: PM2 Built-in (Free)
```bash
pm2 monit  # Real-time dashboard
```

### Option 2: UptimeRobot (Free)
- Sign up at https://uptimerobot.com
- Create a "Keyword Monitor" that pings your bot via Telegram API
- Get alerted by email/SMS if bot goes down

### Option 3: PM2 Plus (Paid, $14/month)
```bash
pm2 link YOUR_PUBLIC_KEY YOUR_SECRET_KEY
```
- Web dashboard, historical metrics, error tracking
- Worth it at $100+/day revenue

---

## Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| VPS (Hetzner CX22) | $4.15/month | 2 vCPU, 4GB RAM — more than enough |
| Helius RPC (free tier) | $0/month | 100k requests/month. Upgrade at $49/month for 1M |
| Domain (optional) | $10/year | Only needed if you add a web frontend |
| **Total** | **~$5/month** | |

---

## When to Scale

| Signal | Action |
|--------|--------|
| >200 concurrent users | Upgrade VPS to 4GB RAM |
| >500 DAU | Switch SQLite → PostgreSQL (see ARCHITECTURE.md) |
| >1000 DAU | Dedicated RPC tier (Helius $49/month) |
| >10,000 DAU | Horizontal scaling (multiple bot instances + Postgres) |
