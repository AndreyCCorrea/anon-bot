import dotenv from 'dotenv';
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  ADMIN_USER_ID: parseInt((process.env.ADMIN_USER_ID || '0').replace(/['"]/g, '').trim(), 10),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  BACKUP_LINK: process.env.BACKUP_LINK || '',
  USER_INACTIVITY_HOURS: parseInt(process.env.USER_INACTIVITY_HOURS || '12', 10),
  AUTOBAN_INACTIVITY_HOURS: parseInt(process.env.AUTOBAN_INACTIVITY_HOURS || '36', 10),
  KEY_USAGE_LIMIT: parseInt(process.env.KEY_USAGE_LIMIT || '500', 10),
};

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in environment variables.');
}
if (!config.ADMIN_USER_ID) {
  throw new Error('ADMIN_USER_ID is missing or invalid in environment variables.');
}

