import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { startReminderJob } from './services/reminders.js';

const app = createApp();
app.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}/api/v1 (docs: /api/docs)`));
startReminderJob();
