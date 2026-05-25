import dotenv from 'dotenv';
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  CONTROL_GROUP_ID: parseInt((process.env.CONTROL_GROUP_ID || '0').replace(/['"]/g, '').trim(), 10),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  BACKUP_LINK: process.env.BACKUP_LINK || '',
};

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in environment variables.');
}
if (!config.CONTROL_GROUP_ID) {
  throw new Error('CONTROL_GROUP_ID is missing or invalid in environment variables.');
}
