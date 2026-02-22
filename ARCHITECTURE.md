# Architecture — nag-bot

## Overview

Single-user Telegram bot for natural language reminders with fuzzy scheduling, nagging, and timezone awareness.

```
User ──► Telegram Bot ──► Command Router
                              │
                    ┌─────────┴──────────┐
                    │                    │
              /done, /list, ...    Everything else
              (direct handling)         │
                    │              Claude API Parser
                    │                    │
                    ▼                    ▼
               SQLite ◄──────── Parsed Reminder
                 │
                 ▼
            Scheduler (30s tick)
                 │
                 ▼
            Fire Notification ──► Telegram Bot ──► User
```

---

## Components

### Telegram Gateway (`src/messaging/telegram.ts`)

- Polling mode (no webhook server needed)
- Single-user: auto-discovers `TELEGRAM_CHAT_ID` on first message, rejects all others
- Routes `/commands` to handlers, everything else to Claude parser
- Chunks messages at 4000 chars, Markdown with fallback

### Claude Parser (`src/parser/reminder-parser.ts`)

- Single API call per user message (no tool-use loop)
- System prompt defines strict JSON output schema
- Generates contextual short codes (MEDS, DOGOUT, PASSPORT)
- Handles timezone change requests ("I'm in Tokyo now")
- Returns `{ type: "clarification" }` for ambiguous requests
- Model: Haiku (fast, cheap). Configurable.

### Scheduler (`src/scheduler/scheduler.ts`)

- **Tick-based**: `setInterval` every 30 seconds
- Each tick: `SELECT * FROM reminders WHERE next_fire_at <= datetime('now') AND status = 'active'`
- Fires notification via Telegram gateway
- **Nag check**: separate query for reminders with `nag_enabled = 1 AND nag_count > 0 AND last_fired_at + nag_interval <= now`
- **Recurring**: after firing, compute next occurrence from `time_of_day` (local) → UTC, fresh jitter, update `next_fire_at`
- **Random**: pre-computed on creation. `next_fire_at` = random point in [now, window_end]. One-shot.

### Fuzzy Engine (`src/scheduler/fuzzy.ts`)

Pure functions:
- `applyJitter(time: Date, fuzzyMinutes: number): Date` — add random offset within ±range
- `pickRandomInWindow(start: Date, end: Date): Date` — uniform random datetime in range
- `nextRecurrence(timeOfDay: string, recurrence: string, timezone: string): Date` — calculate next fire time in UTC

### Storage (`src/storage/`)

**SQLite** via `better-sqlite3` (synchronous API).

Two tables:
- `settings` — key/value pairs (timezone, etc.)
- `reminders` — all reminder data (see Data Model below)

**Store operations**:
- `create(reminder)` — insert + return
- `getDue()` — reminders where `next_fire_at <= now AND status = 'active'`
- `getNagging()` — active nag reminders past their interval
- `getByShortCode(code)` — lookup for `/done`, `/cancel`
- `listActive()` — all active reminders
- `markFired(id)` — update `last_fired_at`, increment `nag_count`
- `confirm(id)` — stop nag, mark confirmed (or just reset nag_count for recurring)
- `cancel(id)` — set status to cancelled
- `pause(id)` / `resume(id)` — toggle status
- `updateNextFire(id, time)` — for recurring recalculation
- `recalculateAllRecurring(timezone)` — called on timezone change

---

## Data Model

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE reminders (
  id            TEXT PRIMARY KEY,       -- nanoid (6 chars)
  short_code    TEXT UNIQUE NOT NULL,   -- Claude-generated mnemonic
  message       TEXT NOT NULL,
  schedule_type TEXT NOT NULL,          -- 'once' | 'recurring' | 'random'
  next_fire_at  TEXT NOT NULL,          -- ISO datetime (UTC)
  recurrence    TEXT,                   -- 'daily' | 'weekdays' | 'weekly' | 'monthly'
  time_of_day   TEXT,                   -- "11:30" (local TZ, for recurring)
  fuzzy_minutes INTEGER DEFAULT 0,      -- 0 = strict
  window_start  TEXT,                   -- for 'random'
  window_end    TEXT,                   -- for 'random'
  nag_enabled   INTEGER DEFAULT 0,
  nag_interval  INTEGER DEFAULT 2,     -- minutes
  nag_count     INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'active',  -- active | paused | confirmed | cancelled
  created_at    TEXT NOT NULL,          -- ISO datetime (UTC)
  last_fired_at TEXT                    -- ISO datetime (UTC)
);
```

### Timezone Handling

- All `next_fire_at`, `created_at`, `last_fired_at` stored in **UTC**
- User's timezone stored in `settings` table (key: `timezone`)
- `time_of_day` stored in **user's local timezone** (e.g., "11:30" means 11:30 in their TZ)
- On display (`/list`), convert UTC → local
- On timezone change, recalculate all active recurring `next_fire_at` values

### Fuzzy vs Strict

- `fuzzy_minutes = 0` → fire at exactly the scheduled UTC time
- `fuzzy_minutes > 0` → add `Math.random() * 2 * fuzzy_minutes - fuzzy_minutes` minutes
- Config default: `strict_by_default: true` (override with `strict_by_default: false` for fuzzy-by-default)
- Per-reminder: Claude parser sets based on user's language ("fuzzy", "around", "exactly", "sharp")

---

## Message Flow Diagrams

### Create Reminder
```
User: "remind me to take my meds every day at 11:30, fuzzy"
  → telegram.ts: not a /command → forward to parser
  → reminder-parser.ts: Claude API call
  → Claude returns: { message, schedule_type: "recurring", time_of_day: "11:30",
      recurrence: "daily", fuzzy: true, fuzzy_minutes: 5, short_code: "MEDS" }
  → reminder-store.ts: create(reminder)
  → fuzzy.ts: nextRecurrence("11:30", "daily", tz) + applyJitter(±5min)
  → store: save with computed next_fire_at
  → telegram.ts: send confirmation
```

### Fire + Nag
```
Scheduler tick:
  → reminder-store.ts: getDue() returns [DOGOUT reminder]
  → telegram.ts: send "🔔 Take the dog out. /done DOGOUT to dismiss"
  → reminder-store.ts: markFired(id) → nag_count = 1, last_fired_at = now

Next tick (2 min later):
  → reminder-store.ts: getNagging() returns [DOGOUT — last_fired + 2min <= now]
  → telegram.ts: send "🔔 Still waiting: Take the dog out. /done DOGOUT"
  → reminder-store.ts: markFired(id) → nag_count = 2
  → ... repeats until /done or max_nag_attempts
```

### Confirm
```
User: "/done DOGOUT"
  → telegram.ts: parse command → getByShortCode("DOGOUT")
  → reminder-store.ts: confirm(id)
    → if one-shot: status = 'confirmed'
    → if recurring: nag_count = 0 (keep active, will fire next recurrence)
  → telegram.ts: send "✓ DOGOUT dismissed."
```

---

## Configuration

| Source | Contents |
|--------|----------|
| `.env` | Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY` |
| `nag-config.yaml` | Runtime tuning: defaults (fuzzy, nag, timezone), scheduler tick, parser model |
| `settings` table | User-mutable state: timezone (changed via `/timezone` command) |

Config precedence: `.env` → `nag-config.yaml` → `settings` table (for timezone).

---

## Deployment

### Local Development
```bash
cp .env.example .env    # Fill in tokens
npm install
npm run dev             # Hot-reload with tsx
```

### Docker
```bash
docker build -t nag-bot .
docker run --env-file .env -v nag-data:/app/data nag-bot
```

### Railway
- Push to GitHub, connect Railway
- Set env vars in Railway dashboard
- Create volume mounted at `/app/data` for SQLite persistence
- Auto-deploys on push to main
