import Database from 'better-sqlite3';
import { env, config } from '../util/config.js';
import { logger } from '../util/logger.js';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dbDir = path.dirname(env.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: Database.Database = new Database(env.DB_PATH);
db.pragma('journal_mode = WAL');

const installSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      short_code TEXT UNIQUE NOT NULL,
      message TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      next_fire_at TEXT NOT NULL,
      recurrence TEXT,
      time_of_day TEXT,
      fuzzy_minutes INTEGER DEFAULT 0,
      window_start TEXT,
      window_end TEXT,
      nag_enabled INTEGER DEFAULT 0,
      nag_interval INTEGER DEFAULT 2,
      nag_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_fired_at TEXT
    );
  `);
};

const seedSettings = () => {
  const checkStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  if (!checkStmt.get('timezone')) {
    insertStmt.run('timezone', config.defaults.timezone);
    logger.info({ timezone: config.defaults.timezone }, 'Seeded default timezone');
  }
};

installSchema();
seedSettings();

export default db;
