import db from './db.js';
import { Reminder } from '../types.js';
import { nextRecurrence, applyJitter } from '../scheduler/fuzzy.js';

export function getTimezone(): string {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('timezone') as { value: string };
    return row ? row.value : 'UTC';
}

export function setTimezone(tz: string): void {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('timezone', tz);
}

export function create(reminder: Reminder): void {
    db.prepare(`
    INSERT INTO reminders (
      id, short_code, message, schedule_type, next_fire_at,
      recurrence, time_of_day, fuzzy_minutes, window_start,
      window_end, nag_enabled, nag_interval, nag_count,
      status, created_at, last_fired_at
    ) VALUES (
      @id, @short_code, @message, @schedule_type, @next_fire_at,
      @recurrence, @time_of_day, @fuzzy_minutes, @window_start,
      @window_end, @nag_enabled, @nag_interval, @nag_count,
      @status, @created_at, @last_fired_at
    )
  `).run({
        ...reminder,
        nag_enabled: reminder.nag_enabled ? 1 : 0
    });
}

export function getDue(nowIso: string): Reminder[] {
    return db.prepare(`
    SELECT * FROM reminders 
    WHERE next_fire_at <= ? AND status = 'active'
  `).all(nowIso) as Reminder[];
}

export function getNagging(nowIso: string): Reminder[] {
    // SQLite doesn't have a direct way to add minutes dynamically easily without date functions,
    // but we can query all active ones with nag_count > 0, and filter in JS.
    const activeNags = db.prepare(`
    SELECT * FROM reminders 
    WHERE nag_enabled = 1 AND nag_count > 0 AND status = 'active'
  `).all() as Reminder[];

    const now = new Date(nowIso).getTime();
    return activeNags.filter(r => {
        if (!r.last_fired_at) return false;
        const lastFired = new Date(r.last_fired_at).getTime();
        return lastFired + (r.nag_interval * 60 * 1000) <= now;
    });
}

export function getByShortCode(code: string): Reminder | undefined {
    return db.prepare('SELECT * FROM reminders WHERE short_code = COLLATE NOCASE ?').get(code) as Reminder | undefined;
}

export function listActive(): Reminder[] {
    return db.prepare("SELECT * FROM reminders WHERE status = 'active' ORDER BY next_fire_at ASC").all() as Reminder[];
}

export function markFired(id: string, nowIso: string): void {
    db.prepare(`
    UPDATE reminders
    SET last_fired_at = ?, nag_count = nag_count + 1
    WHERE id = ?
  `).run(nowIso, id);
}

export function confirm(id: string): void {
    const reminder = db.prepare('SELECT schedule_type FROM reminders WHERE id = ?').get(id) as { schedule_type: string };
    if (!reminder) return;

    if (reminder.schedule_type === 'once' || reminder.schedule_type === 'random') {
        db.prepare("UPDATE reminders SET status = 'confirmed' WHERE id = ?").run(id);
    } else {
        // recurring keeps status 'active' but resets nag_count
        db.prepare('UPDATE reminders SET nag_count = 0 WHERE id = ?').run(id);
    }
}

export function cancel(id: string): void {
    db.prepare("UPDATE reminders SET status = 'cancelled' WHERE id = ?").run(id);
}

export function pause(id: string): void {
    db.prepare("UPDATE reminders SET status = 'paused' WHERE id = ?").run(id);
}

export function resume(id: string): void {
    db.prepare("UPDATE reminders SET status = 'active' WHERE id = ?").run(id);
}

export function updateNextFire(id: string, next_fire_at: string): void {
    db.prepare('UPDATE reminders SET next_fire_at = ?, nag_count = 0 WHERE id = ?').run(next_fire_at, id);
}

export function recalculateAllRecurring(timezone: string): void {
    const recurring = db.prepare("SELECT * FROM reminders WHERE schedule_type = 'recurring' AND status = 'active'").all() as Reminder[];

    for (const r of recurring) {
        if (r.time_of_day && r.recurrence) {
            const baseRecurrence = nextRecurrence(r.time_of_day, r.recurrence, timezone);
            const withJitter = applyJitter(baseRecurrence, r.fuzzy_minutes);
            updateNextFire(r.id, withJitter.toISOString());
        }
    }
}
