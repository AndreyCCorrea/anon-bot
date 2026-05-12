import dotenv from 'dotenv';
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  ADMIN_GROUP_ID: parseInt(process.env.ADMIN_GROUP_ID || '0', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
};

if (!config.BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in environment variables.');
}
if (!config.ADMIN_GROUP_ID) {
  throw new Error('ADMIN_GROUP_ID is missing or invalid in environment variables.');
}
