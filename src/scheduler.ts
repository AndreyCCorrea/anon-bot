import cron from 'node-cron';
import { bot } from './bot';
import { prisma } from './db';
import { getAllMedia, deleteAllMedia } from './mediaDb';

export function initScheduler() {
  // 03:00 UTC - Warn shutdown
  cron.schedule('0 3 * * *', async () => {
    console.log('Running 03:00 UTC Job: Broadcasting shutdown warning');
    const eligibleUsers = await prisma.user.findMany({ where: { isBanned: false, hasBlockedBot: false } });
    const msg = "🌙 <b>Attention!</b> The bot has stopped receiving media for the night. You have <b>30 minutes</b> to save any media you want to keep. After that, all media sent today will be deleted! ⏳";
    for (const user of eligibleUsers) {
      bot.api.sendMessage(Number(user.telegramId), msg, { parse_mode: 'HTML' }).catch(async (err: any) => {
        if (err.error_code === 403) {
          await prisma.user.update({ where: { telegramId: user.telegramId }, data: { hasBlockedBot: true } }).catch(() => {});
        }
      });
      // Wait to respect Telegram's rate limit of 30 msg/sec
      await new Promise(r => setTimeout(r, 50));
    }
  });

  // 03:30 UTC - Delete Media
  cron.schedule('30 3 * * *', async () => {
    console.log('Running 03:30 UTC Job: Deleting sent media');
    const medias = getAllMedia();
    for (const media of medias) {
      bot.api.deleteMessage(media.telegramId, media.messageId).catch(() => {});
      await new Promise(r => setTimeout(r, 50)); // Safely delete under rate limits
    }
    deleteAllMedia();
    console.log('Finished deleting media and truncated the media DB.');
  });

  // 09:00 UTC - Resume Warning
  cron.schedule('0 9 * * *', async () => {
    console.log('Running 09:00 UTC Job: Broadcasting startup warning');
    const eligibleUsers = await prisma.user.findMany({ where: { isBanned: false, hasBlockedBot: false } });
    const msg = "☀️ <b>Good Morning!</b> The bot is now receiving media again. Let's start sharing! 🎉🚀";
    for (const user of eligibleUsers) {
      bot.api.sendMessage(Number(user.telegramId), msg, { parse_mode: 'HTML' }).catch(async (err: any) => {
        if (err.error_code === 403) {
          await prisma.user.update({ where: { telegramId: user.telegramId }, data: { hasBlockedBot: true } }).catch(() => {});
        }
      });
      await new Promise(r => setTimeout(r, 50));
    }
  });
}
