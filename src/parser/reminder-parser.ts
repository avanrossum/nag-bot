import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env, config } from '../util/config.js';
import { ParsedReminder } from '../types.js';

const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const systemPrompt = fs.readFileSync(path.join(ROOT_DIR, 'src/parser/system-prompt.md'), 'utf-8');

export async function parseReminder(message: string, timezone: string): Promise<ParsedReminder> {
    const defaultsStr = JSON.stringify(config.defaults);
    const now = new Date().toISOString();

    const userMessage = `Request: "${message}"\ncurrent_time: ${now}\ntimezone: ${timezone}\ndefaults: ${defaultsStr}`;

    const msg = await client.messages.create({
        model: config.parser.model === 'claude-haiku-3' ? 'claude-3-haiku-20240307' : config.parser.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
            { role: 'user', content: userMessage }
        ],
    });

    const textBlock = msg.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Claude returned empty or non-text response');
    }
    const text = textBlock.text;

    try {
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr) as ParsedReminder;
    } catch (err) {
        throw new Error(`Failed to parse Claude output as JSON: ${text}`);
    }
}
