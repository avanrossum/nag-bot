import { TelegramGateway } from './messaging/telegram.js';
import { Scheduler } from './scheduler/scheduler.js';
import { logger } from './util/logger.js';
import db from './storage/db.js';

async function bootstrap() {
    logger.info('Starting nag-bot...');

    const telegram = new TelegramGateway();

    const scheduler = new Scheduler(async (msg: string) => {
        await telegram.send(msg);
    });

    scheduler.start();

    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Shutting down...');
        scheduler.stop();
        await telegram.stop();

        // close better-sqlite3 synchronously
        db.close();

        logger.info('Graceful shutdown completed');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch(err => {
    logger.error({ err }, 'Failed to start nag-bot');
    process.exit(1);
});
