# DEPLOY.md — Production Deployment on Hetzner Cloud

## Overview

We deploy on **Hetzner Cloud CX22** (~$4/month) running Ubuntu 22.04. PM2 keeps the bot alive indefinitely — auto-restarts on crash, reboots, and memory leaks.

**Total monthly cost:** ~$4 (Hetzner) + $0 (Helius free RPC) = **~$4/month**

---

## Prerequisites (Before You Start)

You'll need these three things ready:

1. **Telegram Bot Token** — from @BotFather on Telegram
2. **Helius API Key** — free at https://helius.dev (100k requests/month)
3. **Solana Wallet Address** — your fee wallet that receives 0.5% of every swap

---

## Step 1: Create Hetzner Account

1. Go to https://accounts.hetzner.com/signUp
2. Sign up with email
3. **If you're in the US:** You'll need to verify identity with passport. Manual approval takes 1–3 hours.
4. Add a payment method (credit card or PayPal)

---

## Step 2: Generate SSH Key (On Your Local Machine)

SSH keys are required — Hetzner disables password login when you add a key (which is what we want).

```bash
# On your local machine (Mac/Linux/WSL)
ssh-keygen -t ed25519 -C "solswap-bot"

# Press Enter for default location (~/.ssh/id_ed25519)
# Set a passphrase (recommended) or press Enter for none

# Copy your PUBLIC key to clipboard:
cat ~/.ssh/id_ed25519.pub
# Copy the entire output — it starts with "ssh-ed25519"
```

**Windows (no WSL):** Use PuTTYgen to generate a key pair.

---

## Step 3: Create the Server

1. Log into Hetzner Cloud Console: https://console.hetzner.cloud
2. Click **"+ New Project"** → name it "solswap-bot"
3. Open the project → click **"Add Server"**

Configure:

| Setting | Value |
|---------|-------|
| **Location** | Falkenstein (EU) or Ashburn (US) — pick closest to you |
| **Image** | Ubuntu 22.04 |
| **Type** | Shared vCPU → **CX22** (2 vCPU, 4GB RAM, 40GB NVMe) |
| **Networking** | Keep IPv4 + IPv6 (default) |
| **SSH Keys** | Click "Add SSH Key" → paste your public key from Step 2 |
| **Firewalls** | Skip for now (we'll configure UFW on the server) |
| **Name** | `solswap-bot` |

4. Click **"Create & Buy"**
5. Note the **IP address** shown — you'll need it to SSH in

**Cost:** ~€3.79/month (~$4.15 USD). Billed hourly, cancel anytime.

---

## Step 4: Connect to Your Server

```bash
# SSH into the server (replace with your IP)
ssh root@YOUR_SERVER_IP

# If it asks about fingerprint, type "yes"
# You should now see: root@solswap-bot:~#
```

---

## Step 5: Secure the Server

Do this immediately after first login.

```bash
# 1. Update system packages
apt update && apt upgrade -y

# 2. Create a non-root user (NEVER run the bot as root)
adduser solbot
# Set a password when prompted, skip the rest with Enter

# 3. Give sudo access
usermod -aG sudo solbot

# 4. Copy your SSH key to the new user
mkdir -p /home/solbot/.ssh
cp ~/.ssh/authorized_keys /home/solbot/.ssh/
chown -R solbot:solbot /home/solbot/.ssh
chmod 700 /home/solbot/.ssh
chmod 600 /home/solbot/.ssh/authorized_keys

# 5. Test the new user (open a NEW terminal window)
# ssh solbot@YOUR_SERVER_IP
# If it works, continue below. If not, check SSH key copy.

# 6. Disable root SSH login
sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# 7. Set up firewall — only allow SSH
ufw allow OpenSSH
ufw --force enable
ufw status
# Should show: OpenSSH ALLOW Anywhere

# 8. Install Fail2Ban (blocks brute-force SSH attempts)
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# 9. Enable automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
# Select "Yes" when prompted
```

Now log out of root and use your new user from now on:
```bash
exit
ssh solbot@YOUR_SERVER_IP
```

---

## Step 6: Install Node.js 20 + PM2

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # Should show v20.x
npm --version    # Should show 10.x

# Install PM2 globally
sudo npm install -g pm2

# Enable PM2 to start on boot
pm2 startup
# PM2 will print a command starting with "sudo env PATH=..."
# COPY AND RUN THAT EXACT COMMAND
```

---

## Step 7: Deploy the Bot

```bash
# Clone your repository
cd ~
git clone YOUR_REPO_URL solswap-bot
cd solswap-bot

# Install dependencies (need devDeps for TypeScript build)
npm install

# Build TypeScript
npm run build
```

---

## Step 8: Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in these values:
```env
# Telegram — from @BotFather
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Solana — Helius RPC (free: https://helius.dev)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY

# Your wallet that receives 0.5% swap fees
FEE_WALLET_ADDRESS=YourSolanaWalletAddressHere

# Jupiter
JUPITER_API_URL=https://quote-api.jup.ag/v6
PLATFORM_FEE_BPS=50

# App
NODE_ENV=production
DATABASE_URL=file:./data/prod.db
LOG_LEVEL=info

# Referral
REFERRAL_FEE_SHARE_PERCENT=25
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`

**IMPORTANT:** Do NOT use public `api.mainnet-beta.solana.com` as your RPC. It rate-limits aggressively and will break the bot. Use Helius (free tier: 100k requests/month) or QuickNode.

---

## Step 9: Initialize Database

```bash
mkdir -p data logs
npx prisma migrate deploy
```

---

## Step 10: Start the Bot

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Check it's running
pm2 status
# Should show: solswap-bot │ online

# Check logs for errors
pm2 logs solswap-bot --lines 20
# Should see: "Bot is running! Listening for messages..."

# Save PM2 state (survives reboot)
pm2 save

# Set database file permissions
chmod 600 ~/solswap-bot/data/prod.db
```

---

## Step 11: Verify It Works

1. Open Telegram on your phone
2. Find your bot (search its @username)
3. Send `/start` — should get welcome message
4. Send `/price SOL` — should show current SOL price
5. Send `/help` — should list all commands

**If something is wrong:**
```bash
pm2 logs solswap-bot --lines 50   # Check for errors
pm2 restart solswap-bot            # Try restarting
```

---

## Running Indefinitely

PM2 handles all failure scenarios automatically:

| Scenario | What Happens |
|----------|-------------|
| Bot crashes (unhandled error) | PM2 auto-restarts with exponential backoff |
| Hetzner VPS reboots (maintenance) | PM2 auto-starts on boot (via `pm2 startup`) |
| Memory leak (>256MB) | PM2 kills and restarts the process |
| You deploy new code | `pm2 restart solswap-bot` — instant restart |
| Network blip | Grammy reconnects Telegram polling automatically |

### Key PM2 Commands

```bash
pm2 status                         # Check bot status
pm2 logs solswap-bot               # Stream live logs
pm2 logs solswap-bot --lines 100   # Last 100 log lines
pm2 restart solswap-bot            # Restart after code changes
pm2 stop solswap-bot               # Stop the bot
pm2 monit                          # Real-time CPU/memory dashboard
```

---

## Deploying Updates

When you push new code:

```bash
cd ~/solswap-bot
git pull origin main
npm install
npm run build
npx prisma migrate deploy    # Apply any new DB migrations
pm2 restart solswap-bot
pm2 logs solswap-bot --lines 10    # Verify clean startup
```

---

## Database Backups

```bash
# Create backup directory
mkdir -p ~/backups

# Set up daily backup at 3 AM via cron
crontab -e
# Add this line:
0 3 * * * cp ~/solswap-bot/data/prod.db ~/backups/prod-$(date +\%Y\%m\%d).db && find ~/backups -mtime +30 -delete
```

This keeps 30 days of daily backups and auto-deletes older ones.

---

## Monitoring

### Option 1: PM2 Built-in (Free)
```bash
pm2 monit   # Real-time CPU/memory/log dashboard
```

### Option 2: UptimeRobot (Free)
1. Sign up at https://uptimerobot.com
2. Create a monitor that hits the Telegram Bot API:
   `https://api.telegram.org/bot<YOUR_TOKEN>/getMe`
3. If this returns an error, your bot token is still valid but bot may be down
4. Get email/SMS alerts on downtime

### Option 3: Simple Health Check Script
```bash
# Add to crontab — checks every 5 minutes if bot is running
*/5 * * * * pm2 pid solswap-bot > /dev/null || pm2 start ~/solswap-bot/ecosystem.config.js
```

---

## Hetzner-Specific Tips

### Hetzner Cloud Firewall (Optional — Extra Layer)
In addition to UFW on the server, you can add a Hetzner Cloud Firewall:

1. Go to Hetzner Console → Firewalls → Create Firewall
2. Add Inbound Rule: TCP Port 22 (SSH) from your IP only
3. Attach firewall to your server

This adds network-level filtering before traffic even reaches your VPS.

### Hetzner Snapshots (Before Major Changes)
Before risky updates, take a snapshot:
1. Hetzner Console → Your Server → Snapshots → Create Snapshot
2. Cost: €0.012/GB/month (~€0.50 for our 40GB server)
3. Restore in 1 click if something goes wrong

### Hetzner Scaling Path
| Plan | Specs | Price | When |
|------|-------|-------|------|
| **CX22** (start here) | 2 vCPU, 4GB RAM | €3.79/mo | 0–500 DAU |
| CX32 | 4 vCPU, 8GB RAM | €6.80/mo | 500–2000 DAU |
| CX42 | 8 vCPU, 16GB RAM | €16.40/mo | 2000+ DAU |

Upgrades are one-click in Hetzner Console (requires a brief reboot).

---

## Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| Hetzner CX22 | €3.79/month (~$4) | 2 vCPU, 4GB RAM, 40GB NVMe, 20TB traffic |
| Helius RPC (free tier) | $0/month | 100k requests/month. Upgrade to $49/mo for 1M |
| Domain (optional) | ~$10/year | Only needed for Phase 3 web terminal |
| **Total** | **~$4/month** | |

---

## Troubleshooting

### Bot won't start
```bash
pm2 logs solswap-bot --lines 50   # Check error messages
cat ~/solswap-bot/.env             # Verify env vars are set
node -e "require('./dist/config')" # Test config loads
```

### "TELEGRAM_BOT_TOKEN is required"
Your `.env` file is missing or the token is empty. Check `nano .env`.

### "FEE_WALLET_ADDRESS must be a valid Solana public key"
Your fee wallet address is malformed. Verify it's a real Solana address (32-44 chars, base58).

### "SOLANA_RPC_URL must be a valid URL"
Check your Helius API key is correct and the URL format is right.

### Bot is online but not responding in Telegram
- Make sure no other instance of this bot is running (only one process can poll the same bot token)
- Check `pm2 logs` for Grammy errors
- Verify the bot token with: `curl https://api.telegram.org/bot<TOKEN>/getMe`

### High memory usage
```bash
pm2 monit                          # Check current usage
pm2 restart solswap-bot            # Quick fix: restart
```
Our `ecosystem.config.js` auto-restarts at 256MB. Normal usage is 50–100MB.
