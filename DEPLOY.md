# DEPLOY.md — Production Deployment on Hostinger VPS

> Complete beginner guide. Windows PC assumed. Every single step explained.

## Overview

We deploy on a **Hostinger VPS** (KVM 1, Ubuntu 22.04 Plain OS, Kuala Lumpur datacenter). PM2 keeps the bot alive 24/7 — auto-restarts on crash, reboots, and memory leaks.

**Total monthly cost:** ~$5–9 (Hostinger) + $0 (Helius free RPC) = **~$5–9/month**

---

## What You Should Already Have

Before starting, make sure you have:

- [x] Hostinger VPS purchased and set up (Ubuntu 22.04 Plain OS, Kuala Lumpur)
- [x] Root password set during VPS setup
- [x] Helius API key (free at https://helius.dev)
- [x] Telegram bot token (from @BotFather)
- [x] Your Solana wallet address (fee wallet)

---

## PART 1: Connect to Your Server from Windows

You need to "SSH into" your server — that means opening a remote terminal session from your Windows PC to your Hostinger server. Think of it like remote desktop, but text-only.

### Step 1: Find Your Server's IP Address and Root Password

1. Go to https://hpanel.hostinger.com
2. Click **VPS** in the top menu
3. Click on your server (the one you just set up)
4. You'll land on the **Overview** page
5. Look for the **SSH access** section — it shows:
   - **IP Address** — something like `103.xx.xx.xx` (write this down)
   - **Port** — `22` (this is the default, don't change it)
   - **Username** — `root`
6. Your **root password** is the one you set during VPS setup
   - If you forgot it: on the same Overview page, scroll to **Root Password** → click **Change Root Password** to set a new one

### Step 2: Open PowerShell on Your Windows PC

Windows 10 and 11 have SSH built in — you do NOT need to install anything extra.

1. Press **Windows key + X** on your keyboard
2. Click **"Terminal"** or **"Windows PowerShell"** (either one works)
3. A blue/black window opens — this is your terminal

> **Can't find it?** Press **Windows key**, type `powershell`, click the app that appears.

### Step 3: Connect to Your Server

In the PowerShell window, type this command (replace `YOUR_IP` with the IP from Step 1):

```powershell
ssh root@YOUR_IP
```

**Example:** If your IP is `103.45.67.89`, type:
```powershell
ssh root@103.45.67.89
```

Press **Enter**.

**What happens next:**

1. First time connecting? It asks:
   ```
   The authenticity of host '103.45.67.89' can't be established.
   Are you sure you want to continue connecting (yes/no/[fingerprint])?
   ```
   Type `yes` and press **Enter**. (This is normal — it's just your PC saying "I haven't seen this server before".)

2. It asks for your password:
   ```
   root@103.45.67.89's password:
   ```
   Type your root password and press **Enter**.
   **The password won't show as you type** — no dots, no stars, nothing. This is normal. Just type it blind and press Enter.

3. If successful, you'll see something like:
   ```
   Welcome to Ubuntu 22.04.x LTS
   root@solswap-bot:~#
   ```

**You're in!** You're now controlling your Hostinger server from your Windows PC.

### Step 3b: Alternative — Use Hostinger's Browser Terminal (Easier)

If SSH feels confusing, Hostinger has a built-in terminal in your browser:

1. Go to hPanel → VPS → click your server
2. On the Overview page, click the **Browser Terminal** button
3. A terminal opens right in your browser — you're already logged in as root
4. Skip to **PART 2** below

> This is great for getting started, but real SSH from PowerShell is better for daily use (faster, supports copy-paste, won't time out).

---

## PART 2: Secure Your Server (Do This First!)

You're now logged into your server as `root`. Run these commands one by one. Copy each line, paste it into the terminal, press Enter, and wait for it to finish before running the next one.

> **How to paste in PowerShell:** Right-click anywhere in the window (or press `Ctrl+V`).
>
> **How to paste in Browser Terminal:** `Ctrl+Shift+V` or right-click → Paste.

### Step 4: Update the System

```bash
apt update && apt upgrade -y
```

This updates all software on the server. Takes 1–2 minutes. If it asks any questions, just press Enter to accept defaults.

### Step 5: Create a Non-Root User

Never run the bot as root — it's a security risk. Create a separate user:

```bash
adduser solbot
```

It will ask:
```
New password:           ← Type a password, press Enter
Retype new password:    ← Type it again, press Enter
Full Name []:           ← Just press Enter (skip)
Room Number []:         ← Just press Enter (skip)
Work Phone []:          ← Just press Enter (skip)
Home Phone []:          ← Just press Enter (skip)
Other []:               ← Just press Enter (skip)
Is the information correct? [Y/n]  ← Type Y, press Enter
```

Now give this user admin powers:

```bash
usermod -aG sudo solbot
```

### Step 6: Set Up SSH Key (So You Don't Need Passwords)

This step is optional but highly recommended. SSH keys let you connect without typing a password every time, and they're much more secure.

**Open a SECOND PowerShell window on your Windows PC** (leave the server connection open). In the NEW window, run:

```powershell
ssh-keygen -t ed25519 -C "solswap-bot"
```

It will ask:
```
Enter file in which to save the key (C:\Users\YourName\.ssh\id_ed25519):
```
Just press **Enter** to accept the default location.

```
Enter passphrase (empty for no passphrase):
```
Press **Enter** for no passphrase (simpler), or type a passphrase (more secure). Either is fine.

```
Enter same passphrase again:
```
Press **Enter** again.

Now **copy your public key to the server**. Still in the NEW PowerShell window on your PC, run:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@YOUR_IP "mkdir -p /home/solbot/.ssh && cat >> /home/solbot/.ssh/authorized_keys && chown -R solbot:solbot /home/solbot/.ssh && chmod 700 /home/solbot/.ssh && chmod 600 /home/solbot/.ssh/authorized_keys"
```

(Replace `YOUR_IP` with your server IP. It will ask for your root password one more time.)

**Test it:** In the same PowerShell window on your PC:
```powershell
ssh solbot@YOUR_IP
```

If it logs you in without asking for a password (or just asks for your SSH passphrase) — it worked!

> **If it asks for a password**, the key copy didn't work. Don't worry — you can still use password login. Just use `ssh solbot@YOUR_IP` and type the password you set in Step 5.

### Step 7: Lock Down the Server

Go back to your **root** terminal session (the first PowerShell window, or Browser Terminal). Run these one at a time:

```bash
# Set up firewall — only allow SSH connections
ufw allow OpenSSH
ufw --force enable
```

You should see: `Firewall is active and enabled on system startup`

```bash
# Install Fail2Ban — blocks anyone who tries to guess your password
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

```bash
# Turn on automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

When it asks "Automatically download and install stable updates?" → select **Yes** → press Enter.

### Step 8: (Optional) Disable Root Login and Password Auth

**Only do this if Step 6 worked** (you can SSH in as `solbot` without a password). If you skip Step 6, skip this too — or you'll lock yourself out.

```bash
sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

### Step 9: Switch to Your New User

From now on, always use `solbot`, not `root`:

```bash
exit
```

In PowerShell on your PC:
```powershell
ssh solbot@YOUR_IP
```

You should see: `solbot@solswap-bot:~$`

---

## PART 3: Install Everything the Bot Needs

You should now be logged in as `solbot`. All commands from here use `sudo` (which means "run as admin").

### Step 10: Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify it worked:
```bash
node --version
```
Should show `v20.x.x`

```bash
npm --version
```
Should show `10.x.x`

### Step 11: Install PM2

PM2 is what keeps the bot running forever — even when you close your terminal or the server reboots.

```bash
sudo npm install -g pm2
```

Set it up to start on boot:
```bash
pm2 startup
```

**IMPORTANT:** PM2 will print a line that looks like:
```
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u solbot --hp /home/solbot
```

**Copy that entire line and run it.** Every person's output is slightly different, so use YOUR output, not this example.

### Step 12: Install Git

```bash
sudo apt-get install -y git
```

---

## PART 4: Deploy the Bot

### Step 13: Clone the Code

```bash
cd ~
git clone YOUR_REPO_URL solswap-bot
cd solswap-bot
```

Replace `YOUR_REPO_URL` with your actual GitHub/GitLab repo URL.

### Step 14: Install Dependencies and Build

```bash
npm install
npm run build
```

The `npm install` takes 1–2 minutes. `npm run build` compiles TypeScript to JavaScript.

### Step 15: Set Up the Environment File

```bash
cp .env.example .env
nano .env
```

`nano` is a simple text editor. Use arrow keys to move around. Fill in these values:

```env
# Telegram — from @BotFather
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Solana — your Helius API key
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

**How to save in nano:**
1. Press `Ctrl+O` (that's the letter O, not zero)
2. Press `Enter` to confirm the filename
3. Press `Ctrl+X` to exit

> **IMPORTANT:** Do NOT use public `api.mainnet-beta.solana.com` as your RPC. It rate-limits aggressively and will break the bot. Use Helius (free tier: 100k requests/month).

### Step 16: Set Up the Database

```bash
mkdir -p data logs
npx prisma migrate deploy
```

---

## PART 5: Start the Bot

### Step 17: Launch with PM2

```bash
pm2 start ecosystem.config.js
```

Check it's running:
```bash
pm2 status
```

You should see a table like:
```
┌─────┬──────────────┬─────────────┬─────────┬──────────┬──────┐
│ id  │ name         │ namespace   │ mode    │ status   │ cpu  │
├─────┼──────────────┼─────────────┼─────────┼──────────┼──────┤
│ 0   │ solswap-bot  │ default     │ fork    │ online   │ 0%   │
└─────┴──────────────┴─────────────┴─────────┴──────────┴──────┘
```

**Status should say `online`.** If it says `errored`, check logs:
```bash
pm2 logs solswap-bot --lines 30
```

Save PM2 state so it survives reboots:
```bash
pm2 save
```

Lock down the database file:
```bash
chmod 600 ~/solswap-bot/data/prod.db
```

### Step 18: Test Your Bot!

1. Open **Telegram** on your phone
2. Search for your bot by its @username
3. Send `/start` — should get a welcome message
4. Send `/price SOL` — should show current SOL price
5. Send `/help` — should list all commands

**If it works — congratulations! Your bot is live and earning fees on every swap.**

---

## PART 6: Everyday Operations

### How to Check if the Bot is Running

From your Windows PC:
```powershell
ssh solbot@YOUR_IP "pm2 status"
```

### How to See Live Logs

```powershell
ssh solbot@YOUR_IP
pm2 logs solswap-bot
```

Press `Ctrl+C` to stop watching logs.

### How to Deploy Code Updates

```powershell
ssh solbot@YOUR_IP
cd ~/solswap-bot
git pull origin main
npm install
npm run build
npx prisma migrate deploy
pm2 restart solswap-bot
pm2 logs solswap-bot --lines 10
```

### How to Restart the Bot

```powershell
ssh solbot@YOUR_IP "pm2 restart solswap-bot"
```

### How to Stop the Bot

```powershell
ssh solbot@YOUR_IP "pm2 stop solswap-bot"
```

### Useful PM2 Commands (Run on the Server)

| Command | What It Does |
|---------|-------------|
| `pm2 status` | Show if bot is running |
| `pm2 logs solswap-bot` | Stream live logs (Ctrl+C to stop) |
| `pm2 logs solswap-bot --lines 50` | Show last 50 lines of logs |
| `pm2 restart solswap-bot` | Restart the bot |
| `pm2 stop solswap-bot` | Stop the bot |
| `pm2 monit` | Real-time CPU/memory dashboard |

---

## PART 7: Automatic Stuff (Set Up Once, Forget Forever)

### PM2 Auto-Recovery

PM2 already handles these automatically:

| Scenario | What Happens |
|----------|-------------|
| Bot crashes (unhandled error) | PM2 auto-restarts it |
| Server reboots (Hostinger maintenance) | PM2 starts bot on boot |
| Memory leak (>256MB) | PM2 kills and restarts |
| Network blip | Grammy reconnects to Telegram automatically |

### Database Backups (Daily at 3 AM)

```bash
# Create backup folder
mkdir -p ~/backups

# Open cron editor
crontab -e
```

If it asks which editor, choose `1` for nano.

Add this line at the bottom:
```
0 3 * * * cp ~/solswap-bot/data/prod.db ~/backups/prod-$(date +\%Y\%m\%d).db && find ~/backups -mtime +30 -delete
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

This copies your database every night at 3 AM and deletes backups older than 30 days.

---

## PART 8: Quick Setup for Next Time (SSH Config)

Typing `ssh solbot@103.45.67.89` every time is annoying. Let's fix that.

**On your Windows PC**, open PowerShell and run:

```powershell
notepad $env:USERPROFILE\.ssh\config
```

If it asks to create the file, click **Yes**. Add this:

```
Host bot
    HostName YOUR_IP
    User solbot
    IdentityFile ~/.ssh/id_ed25519
```

Replace `YOUR_IP` with your actual server IP. Save and close.

Now you can just type:
```powershell
ssh bot
```

That's it — one word and you're in.

---

## Hostinger-Specific Tips

### hPanel Dashboard

Your VPS dashboard at hpanel.hostinger.com shows:
- **Overview:** CPU, RAM, disk usage graphs
- **Browser Terminal:** SSH from your browser (no PowerShell needed)
- **Snapshots:** Save/restore server state
- **Firewall:** Add port rules (in addition to UFW on server)
- **OS Reinstall:** Nuclear option — wipe and start fresh

### Take Snapshots Before Big Changes

Before major updates:
1. hPanel → VPS → your server → **Snapshots**
2. Click **Create** — takes a few seconds
3. If something breaks, restore in 1 click

### Scaling Path

| Plan | Specs | Price | When |
|------|-------|-------|------|
| **KVM 1** (you are here) | 1 vCPU, 4GB RAM, 50GB NVMe | ~$5–9/mo | 0–500 DAU |
| KVM 2 | 2 vCPU, 8GB RAM, 100GB NVMe | ~$7–13/mo | 500–2000 DAU |
| KVM 4 | 4 vCPU, 16GB RAM, 200GB NVMe | ~$11–18/mo | 2000+ DAU |

---

## Monitoring

### Option 1: PM2 Built-in (Free)
```bash
pm2 monit   # Real-time dashboard
```

### Option 2: UptimeRobot (Free)
1. Sign up at https://uptimerobot.com
2. Create a monitor that hits: `https://api.telegram.org/bot<YOUR_TOKEN>/getMe`
3. Get email/SMS alerts if bot goes down

### Option 3: Cron Health Check
```bash
# Add to crontab — checks every 5 minutes
*/5 * * * * pm2 pid solswap-bot > /dev/null || pm2 start ~/solswap-bot/ecosystem.config.js
```

---

## Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| Hostinger KVM 1 | ~$5–9/month | 1 vCPU, 4GB RAM, 50GB NVMe, 4TB bandwidth |
| Helius RPC (free tier) | $0/month | 100k requests/month |
| Domain (optional) | ~$10/year | Only for Phase 3 web terminal |
| **Total** | **~$5–9/month** | |

---

## Troubleshooting

### Can't connect via SSH

**Symptom:** `ssh: connect to host ... port 22: Connection timed out`

- Double-check the IP in hPanel → VPS → Overview
- Make sure you typed it correctly: `ssh root@YOUR_IP`
- Try Hostinger's **Browser Terminal** as a fallback (hPanel → VPS → Terminal button)
- If you locked yourself out (disabled password auth before keys worked): in hPanel, go to your VPS → **Settings → OS Reinstall** to start fresh

### Password not working

- Remember: password is invisible when you type it. Just type it and press Enter.
- Reset it: hPanel → VPS → Overview → **Root Password** → Change Root Password

### Bot won't start (pm2 shows "errored")

```bash
pm2 logs solswap-bot --lines 50
```

Common errors:
- `TELEGRAM_BOT_TOKEN is required` → your `.env` file is missing the token. Run `nano .env` and check.
- `FEE_WALLET_ADDRESS must be a valid Solana public key` → wallet address is wrong. Should be 32-44 characters, letters and numbers only.
- `SOLANA_RPC_URL must be a valid URL` → check your Helius API key in `.env`.
- `Cannot find module` → you forgot to build. Run `npm run build`.

### Bot is online but not responding in Telegram

- Only one bot process can use the same token. Make sure you don't have it running somewhere else.
- Check: `pm2 logs solswap-bot --lines 20`
- Test: `curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe` (replace with your actual token)

### High memory usage

```bash
pm2 monit
```

Normal usage is 50–100MB. The `ecosystem.config.js` auto-restarts at 256MB. If it keeps climbing, just restart: `pm2 restart solswap-bot`.

### "npm: command not found" or "node: command not found"

Node.js wasn't installed properly. Run Step 10 again.

### "permission denied"

You probably need `sudo` in front of the command. Try: `sudo <your command>`.
