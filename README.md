# 🔔 Nag-Bot

A single-user, natural language Telegram bot that schedules fuzzy reminders and relentlessly nags you until you actually do the thing. 

Powered by the Anthropic SDK (Claude) for natural language parsing, and a robust local SQLite engine for tick-based scheduling. 

## Features

- **Natural Language Parsing**: Say "remind me to call John tomorrow at 3pm" and the bot figures out the optimal schedule.
- **Fuzzy Scheduling**: Ask to be reminded "around noon" and the bot will add a configurable jitter (e.g., ±5 minutes) so it doesn't feel robotic.
- **Nagging**: If you ask it to "nag me to take my meds every day at 11am", it will ping you every few minutes *until you explicitly confirm* you've done it.
- **Zero-Config Auth**: It automatically locks to the first Telegram chat ID that messages it, rejecting all others. Your data is private.
- **Timezone Aware**: Handles recurring events seamlessly across timezones. "I'm in Tokyo now" automatically updates your schedules.
- **Ergonomic Short Codes**: The AI generates smart mnemonics (e.g., `MEDS`, `DOGOUT`, `LAUNDRY`) making it easy to mark tasks as done (`/done MEDS`).
- **Secure Backups**: Instantly snapshot and deliver your SQLite database right to your Telegram chat via `/backup`.

## What can you say to it?

Just text the bot naturally. 

**One-off reminders**:
- *"Remind me to check the oven in 20 minutes"*
- *"At exactly 5pm tomorrow, remind me to leave the office"* (skips fuzzy jitter)

**Recurring & Nagging**:
- *"Nag me to take my vitamins every morning at 9am"*
- *"Remind me to do the laundry sometime in the next 3 hours"* (picks a random time in the window)

**Bot Commands** (processed natively without AI latency):
- `/list` - View all active reminders
- `/done <CODE>` - Stop the nagging and mark a task as done (e.g., `/done MEDS`)
- `/cancel <CODE>` - Permanently cancel a reminder
- `/pause <CODE>` / `/resume <CODE>` - Temporarily halt a reminder
- `/timezone <tz>` - Update your local timezone (e.g., `/timezone America/New_York`)
- `/backup` - Generate a safe SQLite `.db` snapshot and receive it in chat
- `/autobackup <HH:MM>` - Schedule a daily automatic backup sent to you (e.g., `/autobackup 22:55`). Use `/autobackup off` to disable it.

### 🔄 Restoring a Backup
If you ever migrate to a new machine or lose your primary volume:
1. Download the `.db` file from Telegram.
2. Rename it to `nag.db`.
3. Drop it securely into your `data/` folder (or overwrite the existing one at `/app/data/nag.db`), overriding the corrupt/empty file.
4. Restart the bot (`npm run dev` or redeploy on Railway). It will pick right back up from your last saved state!

---

## Installation 

### Prerequisites
- Node.js 22+
- A Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- An [Anthropic API Key](https://console.anthropic.com/) (defaults to the cheap, fast Haiku model)

### 1. Local Development

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/avanrossum/nag-bot.git
   cd nag-bot
   npm install
   ```

2. Set up your environment:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY`. 

3. Start the bot:
   ```bash
   npm run dev
   ```
   **Bootstrapping Auth**: The first time you start the bot, send it a message on Telegram. It will bind permanently to your Chat ID and ignore strangers.

### 2. Deploying on Railway (Recommended)

Because `nag-bot` runs a polling engine (no webhooks necessary) and relies on SQLite, deployment on Railway using Docker is extremely straightforward.

1. Create a **New Project** on Railway from this GitHub repository.
2. In your Railway service's **Variables**, add:
   - `TELEGRAM_BOT_TOKEN`
   - `ANTHROPIC_API_KEY`
   - `DB_PATH=/app/data/nag.db`
3. Go to the project **Settings** > **Volumes** and add a new volume mounted at `/app/data`. *This is critical—without a volume, your SQLite database will wipe every time you deploy.*
4. Deploy! The bot will automatically compile the TypeScript, spin up, and resume ticking where it left off.

---

## Configuration Tuning

You can tweak the bot's core logic inside `nag-config.yaml`:
```yaml
defaults:
  fuzzy_minutes: 5           # Range of random jitter (0 = exact)
  strict_by_default: true    # If false, everything gets jitter unless user specifies "exactly"
  nag_interval_minutes: 2    # How often to pester you when nagging is enabled
  max_nag_attempts: 50       # Cutoff to prevent infinite loops
  timezone: America/New_York 

scheduler:
  tick_seconds: 30           # How often the loop evaluates SQLite for tasks
```

## Contributing
Pull requests are welcome! See `ROADMAP.md` for our next open tasks. 

## License
MIT
