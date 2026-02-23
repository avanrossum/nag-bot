# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added
- **Core Scheduler**: Tick-based event loop natively paired with a local `better-sqlite3` WAL database for high-concurrency reminder polling.
- **Anthropic AI Parser**: Uses Claude-3-Haiku to safely and reliably parse "gibberish" texts into strictly typed JSON payload structures representing future state intervals.
- **Fuzzy Math Engine**: Support for random jitter and arbitrary distributions across precise UTC/Local timezone configurations.
- **Telegram Gateway**: Native bindings leveraging `node-telegram-bot-api` to bypass API latency for hardcoded commands.
- **Single-User Lock**: Intelligent Auto-Discovery on boot that binds the process uniquely to the first Chat ID intercepted, locking out all foreign requesters. Persistence guaranteed across Docker recycles.
- **Robust Modifiers**: Built-in logic gates detecting `Fuzzy`, `Exactly`, `Nag/Bug me`, `Every`, and `Sometime in`.
- **Relentless Nagging**: A recursive subsystem pushing active alerts to the gateway until explicitly silenced by `/done <CODE>`.
- **Database Backups**: Instant un-locked state backups sent over AES-secured Telegram networks via `/backup` or the `/autobackup <time>` scheduler.
- **Smart Chunking**: Protects Telegram rate-limits handling large data lists iteratively under 4000 characters natively.

### Fixed
- Fixed an `UnhandledException` loop related to SQLite explicit `null` bind rejections.
- Fixed an issue where single-shot reminders effectively became recurring nightmares by bouncing off `getDue()` bounds without checking `nag` parameters properly. 
- Remapped the Telegram initialization string `/start` correctly to the internal command `/help`.
- Fixed an `ENOENT: no such file or directory` error in the Docker container where the compiled Javascript was attempting to read the AI markdown scheme internally within `dist/` rather than reading raw from `src/`.
