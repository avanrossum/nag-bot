import { getDue, getNagging, markFired, updateNextFire, getTimezone } from '../storage/reminder-store.js';
import { nextRecurrence, applyJitter } from './fuzzy.js';
import { logger } from '../util/logger.js';
import { config } from '../util/config.js';

export type FireCallback = (message: string) => Promise<void>;

export class Scheduler {
    private timer: NodeJS.Timeout | null = null;
    private isTicking: boolean = false;

    constructor(private fireCallback: FireCallback) { }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), config.scheduler.tick_seconds * 1000);
        logger.info('Scheduler started');
        // run an initial tick
        this.tick();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        logger.info('Scheduler stopped');
    }

    async tick() {
        if (this.isTicking) return;
        this.isTicking = true;

        try {
            const nowIso = new Date().toISOString();
            const due = getDue(nowIso);

            for (const r of due) {
                let msg = `🔔 ${r.message}`;
                if (r.nag_enabled || r.schedule_type === 'recurring') {
                    msg += `\n/done ${r.short_code} to dismiss`;
                }

                await this.fireCallback(msg);
                markFired(r.id, nowIso);

                if (r.schedule_type === 'recurring' && r.time_of_day && r.recurrence) {
                    const tz = getTimezone();
                    const baseTime = nextRecurrence(r.time_of_day, r.recurrence, tz);
                    const withJitter = applyJitter(baseTime, r.fuzzy_minutes);
                    updateNextFire(r.id, withJitter.toISOString());
                }
            }

            const nags = getNagging(nowIso);
            for (const r of nags) {
                if (r.nag_count >= config.defaults.max_nag_attempts) continue;

                let msg = `🔔 Still waiting: ${r.message}\n/done ${r.short_code} to dismiss`;
                await this.fireCallback(msg);
                markFired(r.id, nowIso);
            }

        } catch (err) {
            logger.error({ err }, 'Error in scheduler tick');
        } finally {
            this.isTicking = false;
        }
    }
}
