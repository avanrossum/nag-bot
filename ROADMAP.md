# Roadmap — nag-bot

## v0.1.0 — Core Engine

### Phase 1: Foundation
- [x] `src/types.ts` — `Reminder`, `ParsedReminder`, `AppConfig`, `NagConfig` interfaces
- [x] `src/util/config.ts` — load `.env` (dotenv) + parse `nag-config.yaml` (yaml). Export typed `env` and `config` objects. `requireEnv()` helper for mandatory vars.
- [x] `src/util/logger.ts` — pino logger, level from `LOG_LEVEL` env var

### Phase 2: Storage
- [x] `src/storage/db.ts` — initialize SQLite (`better-sqlite3`), create tables if not exist (`settings` + `reminders`), seed default timezone. DB path from `DB_PATH` env var or default `./data/nag.db`.
- [x] `src/storage/reminder-store.ts` — CRUD: `create()`, `getDue()`, `getNagging()`, `getByShortCode()`, `listActive()`, `markFired()`, `confirm()`, `cancel()`, `pause()`, `resume()`, `updateNextFire()`, `recalculateAllRecurring()`, `getTimezone()`, `setTimezone()`
- [ ] Unit tests for all store operations

### Phase 3: Parser
- [x] `src/parser/system-prompt.md` — already scaffolded, review and finalize
- [x] `src/parser/reminder-parser.ts` — `parseReminder(message: string, timezone: string): Promise<ParsedReminder>`. Single Claude API call. Handle `clarification` responses. Handle `timezone_change` responses.
- [ ] Unit tests with mocked Claude responses

### Phase 4: Scheduler
- [x] `src/scheduler/fuzzy.ts` — `applyJitter()`, `pickRandomInWindow()`, `nextRecurrence()`. All pure functions, easily testable.
- [x] `src/scheduler/scheduler.ts` — tick engine: `start()`, `stop()`, `tick()`. On each tick: query `getDue()`, fire each, handle nags via `getNagging()`, recalculate recurring.
- [ ] Unit tests for fuzzy math and scheduler logic

### Phase 5: Telegram
- [x] `src/messaging/telegram.ts` — polling bot, single-user auth (auto-discover + enforce chat ID), message chunking at 4000 chars, Markdown with fallback retry
- [x] Command routing: `/done`, `/list`, `/cancel`, `/pause`, `/resume`, `/timezone`, `/help`
- [x] Integration with parser (non-command messages → Claude) and store (command handlers → CRUD)

### Phase 6: Integration
- [x] `src/index.ts` — construct all components, wire dependencies, start bot + scheduler
- [x] Graceful shutdown: SIGINT/SIGTERM → stop scheduler, stop telegram polling, close SQLite
- [ ] End-to-end testing via Telegram

### Phase 7: Polish
- [x] `README.md` — usage examples, setup instructions, screenshots
- [x] Docker build + local test
- [x] Railway deployment guide
- [x] Verify restart persistence (kill + restart, reminders survive)

---

## Future (post-v0.1.0)

- [ ] Snooze command (`/snooze MEDS 30m` — delay next fire by N minutes)
- [ ] Edit reminder (`/edit MEDS time 10:00` — change time)
- [ ] Reminder history/stats
- [ ] Web dashboard (read-only)
- [ ] Multi-user support (if open source demand warrants it)
