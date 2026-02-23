export type ScheduleType = 'once' | 'recurring' | 'random';
export type RecurrenceType = 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type ReminderStatus = 'active' | 'paused' | 'confirmed' | 'cancelled';

export interface Reminder {
    id: string;
    short_code: string;
    message: string;
    schedule_type: ScheduleType;
    next_fire_at: string; // ISO 8601 UTC
    recurrence?: RecurrenceType | null;
    time_of_day?: string | null; // HH:MM local
    fuzzy_minutes: number;
    window_start?: string | null; // ISO 8601 UTC
    window_end?: string | null; // ISO 8601 UTC
    nag_enabled: boolean | number;
    nag_interval: number;
    nag_count: number;
    status: ReminderStatus;
    created_at: string; // ISO 8601 UTC
    last_fired_at?: string | null; // ISO 8601 UTC
}

// JSON output from Claude parser
export interface ParsedReminder {
    type: 'reminder' | 'timezone_change' | 'clarification';
    message?: string;
    schedule_type?: ScheduleType;
    fire_at?: string; // ISO 8601 UTC for 'once'
    time_of_day?: string; // HH:MM local
    recurrence?: RecurrenceType;
    window_start?: string; // ISO 8601 UTC
    window_end?: string; // ISO 8601 UTC
    fuzzy?: boolean;
    fuzzy_minutes?: number;
    nag?: boolean;
    nag_interval_minutes?: number;
    short_code?: string;
    timezone?: string; // for timezone_change
    question?: string; // for clarification
}

export interface AppConfig {
    defaults: {
        fuzzy_minutes: number;
        strict_by_default: boolean;
        nag_interval_minutes: number;
        max_nag_attempts: number;
        timezone: string;
    };
    scheduler: {
        tick_seconds: number;
    };
    parser: {
        model: string;
    };
}

export interface EnvConfig {
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string | undefined; // Optional until initialized
    ANTHROPIC_API_KEY: string;
    DB_PATH: string;
    LOG_LEVEL: string;
}

export interface NagConfig {
    enabled: boolean;
    intervalMinutes: number;
    maxAttempts: number;
}
