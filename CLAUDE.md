# Claude Code Instructions — nag-bot

> Fuzzy reminders Telegram bot. Parse with Claude, store in SQLite, fire on schedule, nag until confirmed.

## Session Start Checklist

1. Read this file
2. Read `ARCHITECTURE.md` (system design)
3. Read `ROADMAP.md` (build phases — find the next unchecked item)
4. Read `src/parser/system-prompt.md` (Claude parser prompt)

---

## What This Is

A single-user Telegram bot that accepts natural language reminder requests, parses them via Claude API, stores them in SQLite, and fires notifications on schedule. Supports fuzzy scheduling (jitter), nagging (re-remind until confirmed), recurring reminders, and random-window reminders.

**Open source.** No personal data. MIT license.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ES modules) |
| Runtime | Node.js 22+ |
| Telegram | `node-telegram-bot-api` (polling mode) |
| AI Parser | `@anthropic-ai/sdk` (Haiku) |
| Storage | `better-sqlite3` |
| Config | `dotenv` + `yaml` |
| Logging | `pino` |
| IDs | `nanoid` |
| Tests | `vitest` |
| Deploy | Docker + Railway |

---

## Key Architecture Decisions

1. **Tick-based scheduler** — Every 30s, query SQLite for due reminders. No setTimeout registration, survives restarts, SQLite is source of truth.

2. **Fuzzy vs strict** — `fuzzy_minutes = 0` means exact time. `fuzzy_minutes > 0` adds random jitter within ±N minutes. Strict by default (configurable).

3. **Claude for parsing only** — One API call per user message. No tool-use loop. Claude returns structured JSON. Commands (`/done`, `/list`, etc.) bypass Claude entirely.

4. **UTC storage** — All `next_fire_at` stored in UTC. User's timezone in `settings` table. Local time converted on input/output.

5. **Short codes** — Claude generates contextual mnemonics (MEDS, DOGOUT). Used for `/done`, `/cancel` etc. More ergonomic than IDs.

---

## Reference Implementation: life-agent

This project follows patterns from `~/Developer/life-agent`. When implementing, reference these files:

| Pattern | life-agent file | Notes |
|---------|----------------|-------|
| Telegram gateway | `src/messaging/telegram-gateway.ts` | Polling, single-user auth, message chunking at 4000 chars, Markdown parse with fallback |
| Config loading | `src/util/config.ts` | `dotenv` + `yaml` parse pattern. `requireEnv()` for mandatory vars |
| Logger | `src/util/logger.ts` | Pino setup with env-controlled level |
| Graceful shutdown | `src/index.ts` | SIGINT/SIGTERM handlers, stop timers, cleanup |
| Claude API call | `src/engine/processor.ts` | `client.messages.create()` pattern |
| Intent routing | `src/engine/intent-classifier.ts` | Prefix-based command detection |

**Do NOT copy**: git sync manager, conversation buffer, outbound scheduler, archivist, forecast engine. Those are life-agent-specific.

---

## Build Approach

Work phase by phase from `ROADMAP.md`. Each phase should:
1. Implement the code
2. Write tests
3. Verify tests pass (`npm test`)
4. Update ROADMAP.md (check off completed items)

Build bottom-up: types → storage → parser → scheduler → telegram → wiring.

---

## Coding Standards

- **ESM only** — `"type": "module"` in package.json. Use `.js` extensions in imports.
- **Strict TypeScript** — No `any`. Type everything.
- **Async/await** — Exception: `better-sqlite3` is synchronous by design.
- **Pino logging** — Structured: `logger.info({ event: 'value' }, 'message')`.
- **Error handling** — Catch at boundaries (Telegram handler, scheduler tick). Log and continue. Never crash the bot.
- **No globals** — Pass dependencies through constructors.

---

## File Purposes

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point. Construct components, wire together, start bot + scheduler, handle shutdown. |
| `src/types.ts` | All TypeScript interfaces: `Reminder`, `ParsedReminder`, `NagConfig`, `AppConfig`, etc. |
| `src/messaging/telegram.ts` | Telegram polling bot. Single-user auth (chat ID check). Command routing. Message dispatch. |
| `src/parser/reminder-parser.ts` | Claude API call. Send user message + system prompt → get structured JSON back. |
| `src/parser/system-prompt.md` | The system prompt for Claude. Defines output schema, short code generation, timezone awareness. |
| `src/scheduler/scheduler.ts` | Tick engine. Every N seconds: query due reminders, fire them, handle nags, recalculate recurring. |
| `src/scheduler/fuzzy.ts` | Pure functions: add jitter, pick random time in window, calculate next recurrence. |
| `src/storage/db.ts` | SQLite initialization, schema creation, migrations. |
| `src/storage/reminder-store.ts` | CRUD operations: create, list, getByShortCode, markFired, confirm, cancel, pause, resume, getDue. |
| `src/util/config.ts` | Load `.env` + parse `nag-config.yaml`. Export typed config object. |
| `src/util/logger.ts` | Pino logger instance. |

---

## Commands (handled without Claude)

| Command | Handler logic |
|---------|--------------|
| `/done <CODE>` | Find by short_code. If nag active, stop nag (reset nag_count). If one-shot, mark confirmed. If recurring, acknowledge + keep schedule. |
| `/list` | Query all `status = 'active'`. Format as list with short codes, messages, next fire times (in local TZ). |
| `/cancel <CODE>` | Set `status = 'cancelled'`. |
| `/pause <CODE>` | Set `status = 'paused'`. Scheduler skips paused reminders. |
| `/resume <CODE>` | Set `status = 'active'`. Recalculate `next_fire_at` if it's in the past. |
| `/timezone <tz>` | Update `settings` table. Recalculate all active recurring reminders' `next_fire_at`. |
| `/help` | Static help text. |

**Everything else** goes to Claude parser.

---

## Gotchas

1. **better-sqlite3 in Docker** — Needs native compilation. `node:22-slim` works. Alpine does NOT (missing glibc). Stick with `-slim`.
2. **Telegram message limit** — 4096 chars. Chunk at 4000 to leave room for Markdown overhead.
3. **Timezone edge cases** — DST transitions. When timezone changes, some `time_of_day` values may shift. Recalculate all active recurring on TZ change.
4. **Nanoid uniqueness** — 6-char nanoid has ~56 billion combinations. Fine for single-user. Short codes have collision potential — check uniqueness on insert, append digit if collision.
5. **Railway volumes** — SQLite needs persistent disk. Mount `/app/data` as a Railway volume. Set `DB_PATH` env var to `/app/data/nag.db`.
6. **Haiku model name** — Check current model string at build time. May be `claude-3-haiku-20240307` or similar.

---

## Session End Checklist

1. All tests pass (`npm test`)
2. `ROADMAP.md` updated (completed phases checked off)
3. Code committed and pushed
4. No half-finished work
