import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import { AppConfig, EnvConfig } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export const env: EnvConfig = {
    TELEGRAM_BOT_TOKEN: requireEnv('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    ANTHROPIC_API_KEY: requireEnv('ANTHROPIC_API_KEY'),
    DB_PATH: process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'nag.db'),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

const configStr = fs.readFileSync(path.join(ROOT_DIR, 'nag-config.yaml'), 'utf8');
export const config: AppConfig = yaml.parse(configStr);
