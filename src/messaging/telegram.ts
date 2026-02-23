import TelegramBot from 'node-telegram-bot-api';
import { env, config } from '../util/config.js';
import { logger } from '../util/logger.js';
import { parseReminder } from '../parser/reminder-parser.js';
import * as store from '../storage/reminder-store.js';
import { applyJitter, pickRandomInWindow, nextRecurrence } from '../scheduler/fuzzy.js';
import { nanoid } from 'nanoid';
import { Reminder } from '../types.js';
import { db } from '../storage/db.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

export class TelegramGateway {
    private bot: TelegramBot;
    private chatId: string | undefined;

    constructor() {
        this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });
        this.chatId = env.TELEGRAM_CHAT_ID;

        this.bot.on('message', this.handleMessage.bind(this));
        this.bot.on('polling_error', (error) => logger.error({ error }, 'Telegram polling error'));
    }

    async send(text: string): Promise<void> {
        if (!this.chatId) return;

        // chunking at 4000
        const chunks = text.match(/[\s\S]{1,4000}/g) || [];
        for (const chunk of chunks) {
            try {
                await this.bot.sendMessage(this.chatId, chunk, { parse_mode: 'Markdown' });
            } catch (err: any) {
                // Fallback retry without markdown
                if (err?.response?.body?.error_code === 400 && err?.response?.body?.description?.includes('can\'t parse entities')) {
                    await this.bot.sendMessage(this.chatId, chunk);
                } else {
                    logger.error({ err, chunk }, 'Failed to send telegram message');
                }
            }
        }
    }

    async stop(): Promise<void> {
        await this.bot.stopPolling();
    }

    private async handleMessage(msg: TelegramBot.Message): Promise<void> {
        const text = msg.text?.trim();
        if (!text) return;
        const msgChatId = msg.chat.id.toString();

        if (!this.chatId) {
            this.chatId = msgChatId;
            logger.info({ chatId: msgChatId }, 'Auto-discovered chat ID');
            env.TELEGRAM_CHAT_ID = msgChatId; // update in-memory
            await this.send('Bot locked to this chat ID. Welcome!');
        }

        if (msgChatId !== this.chatId) {
            logger.warn({ msgChatId, authorizedChatId: this.chatId }, 'Rejecting unauthorized user');
            return;
        }

        try {
            if (text.startsWith('/')) {
                await this.handleCommand(text);
            } else {
                await this.handleNaturalLanguage(text);
            }
        } catch (err) {
            logger.error({ err, text }, 'Error handling message');
            await this.send('An error occurred processing your request.');
        }
    }

    private async handleCommand(text: string): Promise<void> {
        const parts = text.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const arg = parts[1]?.toUpperCase(); // mostly short codes

        switch (cmd) {
            case '/done': {
                if (!arg) return this.send('Usage: /done <CODE>');
                const r = store.getByShortCode(arg);
                if (!r) return this.send(`No active reminder found with code ${arg}.`);
                store.confirm(r.id);
                await this.send(`✓ ${arg} confirmed.`);
                break;
            }
            case '/list': {
                const active = store.listActive();
                if (active.length === 0) return this.send('No active reminders.');
                let reply = '*Active Reminders*\n\n';
                for (const r of active) {
                    const tz = store.getTimezone();
                    const localString = new Date(r.next_fire_at).toLocaleString('en-US', { timeZone: tz });
                    reply += `- **${r.short_code}**: ${r.message}\n  Next: ${localString}\n`;
                }
                await this.send(reply);
                break;
            }
            case '/cancel': {
                if (!arg) return this.send('Usage: /cancel <CODE>');
                const r = store.getByShortCode(arg);
                if (!r) return this.send(`No reminder found with code ${arg}.`);
                store.cancel(r.id);
                await this.send(`🚫 ${arg} cancelled.`);
                break;
            }
            case '/pause': {
                if (!arg) return this.send('Usage: /pause <CODE>');
                const r = store.getByShortCode(arg);
                if (!r) return this.send(`No reminder found with code ${arg}.`);
                store.pause(r.id);
                await this.send(`⏸️ ${arg} paused.`);
                break;
            }
            case '/resume': {
                if (!arg) return this.send('Usage: /resume <CODE>');
                const r = store.getByShortCode(arg);
                if (!r) return this.send(`No reminder found with code ${arg}.`);
                store.resume(r.id);
                // Note: Recalculate if missed it
                if (new Date(r.next_fire_at).getTime() < Date.now()) {
                    if (r.schedule_type === 'recurring' && r.time_of_day && r.recurrence) {
                        const tz = store.getTimezone();
                        const next = nextRecurrence(r.time_of_day, r.recurrence, tz);
                        const wj = applyJitter(next, r.fuzzy_minutes);
                        store.updateNextFire(r.id, wj.toISOString());
                    } else {
                        await this.send(`⚠️ ${arg} is now active but its scheduled time is in the past!`);
                    }
                }
                await this.send(`▶️ ${arg} resumed.`);
                break;
            }
            case '/timezone': {
                const newTz = parts[1];
                if (!newTz) {
                    const cTz = store.getTimezone();
                    return this.send(`Current timezone: ${cTz}\nUsage: /timezone America/New_York`);
                }
                try {
                    new Intl.DateTimeFormat('en-US', { timeZone: newTz });
                } catch {
                    return this.send(`Invalid timezone: ${newTz}`);
                }
                store.setTimezone(newTz);
                store.recalculateAllRecurring(newTz);
                await this.send(`Timezone updated to ${newTz}. Recalculated active recurring reminders.`);
                break;
            }
            case '/help': {
                await this.send('Commands:\n/list\n/done <CODE>\n/cancel <CODE>\n/pause <CODE>\n/resume <CODE>\n/timezone <tz>\n/backup\n\nOr just speak naturally! "Remind me to call John tomorrow at 3pm"');
                break;
            }
            case '/backup': {
                if (!this.chatId) return;
                await this.send('⏳ Generating safe database backup...');
                try {
                    const dt = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupPath = path.join(os.tmpdir(), `nag-backup-${dt}.db`);
                    await db.backup(backupPath);
                    await this.bot.sendDocument(this.chatId, backupPath, {
                        caption: `📦 NagBot Backup - ${new Date().toLocaleString('en-US', { timeZone: store.getTimezone() })}`
                    });
                    fs.unlinkSync(backupPath);
                } catch (err: any) {
                    logger.error({ err }, 'Backup failed');
                    await this.send(`❌ Backup failed: ${err.message}`);
                }
                break;
            }
            default:
                await this.send(`Unknown command: ${cmd}`);
        }
    }

    private async handleNaturalLanguage(text: string): Promise<void> {
        const tz = store.getTimezone();
        const parsed = await parseReminder(text, tz);

        if (parsed.type === 'clarification') {
            return this.send(parsed.question || 'Please provide more details.');
        }

        if (parsed.type === 'timezone_change' && parsed.timezone) {
            store.setTimezone(parsed.timezone);
            store.recalculateAllRecurring(parsed.timezone);
            return this.send(`Timezone updated to ${parsed.timezone}`);
        }

        if (parsed.type === 'reminder') {
            let code = parsed.short_code || 'REM';
            // Check short code uniqueness natively:
            let uniqCode = code;
            let c = 1;
            while (store.getByShortCode(uniqCode)) {
                uniqCode = `${code}${c++}`;
            }

            let nextFireAtMs = 0;
            if (parsed.schedule_type === 'once') {
                if (!parsed.fire_at) return this.send('Failed: "once" with no fire_at from API.');
                nextFireAtMs = new Date(parsed.fire_at).getTime();
            } else if (parsed.schedule_type === 'recurring') {
                if (!parsed.time_of_day || !parsed.recurrence) return this.send('Failed: missing time_of_day/recurrence.');
                const next = nextRecurrence(parsed.time_of_day, parsed.recurrence, tz);
                nextFireAtMs = next.getTime();
            } else if (parsed.schedule_type === 'random') {
                if (!parsed.window_start || !parsed.window_end) return this.send('Failed: missing windows.');
                const picked = pickRandomInWindow(new Date(parsed.window_start), new Date(parsed.window_end));
                nextFireAtMs = picked.getTime();
            }

            if (parsed.fuzzy && parsed.fuzzy_minutes) {
                nextFireAtMs = applyJitter(new Date(nextFireAtMs), parsed.fuzzy_minutes).getTime();
            }

            const rem: Reminder = {
                id: nanoid(6),
                short_code: uniqCode,
                message: parsed.message || 'Reminder',
                schedule_type: parsed.schedule_type || 'once',
                next_fire_at: new Date(nextFireAtMs).toISOString(),
                recurrence: parsed.recurrence || null,
                time_of_day: parsed.time_of_day || null,
                fuzzy_minutes: parsed.fuzzy_minutes || 0,
                window_start: parsed.window_start || null,
                window_end: parsed.window_end || null,
                nag_enabled: parsed.nag || false,
                nag_interval: parsed.nag_interval_minutes || config.defaults.nag_interval_minutes,
                nag_count: 0,
                status: 'active',
                created_at: new Date().toISOString()
            };

            store.create(rem);
            return this.send(`👍 Recorded. Will remind you \`${uniqCode}\`.`);
        }
    }
}
