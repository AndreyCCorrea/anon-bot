import cron from 'node-cron';
import { bot, performBan } from './bot';
import { prisma } from './db';
import { getAllMedia, deleteAllMedia } from './mediaDb';
import { config } from './config';

export function initScheduler() {
  // Hourly - Autoban users inactive for 36 hours
  cron.schedule('0 * * * *', async () => {
    console.log('Running Hourly Job: Checking for 36-hour inactivity');
    const thirtySixHoursAgo = new Date(Date.now() - 36 * 60 * 60 * 1000);

    // Find users who haven't sent media in 36h (or since account creation)
    const inactiveUsers = await prisma.user.findMany({
      where: {
        isBanned: false,
        OR: [
          { lastMediaSentAt: { lte: thirtySixHoursAgo } },
          { lastMediaSentAt: null, createdAt: { lte: thirtySixHoursAgo } }
        ]
      }
    });

    if (inactiveUsers.length > 0) {
      console.log(`Found ${inactiveUsers.length} inactive users to ban.`);
      let bannedCount = 0;
      for (const user of inactiveUsers) {
        const banned = await performBan(Number(user.telegramId));
        if (banned) {
          bannedCount++;
          // Send ban message
          const msg = "🚫 <b>You have been automatically banned</b> because you were inactive for more than 36 hours without sending any media.\n\nYou must provide a new valid access key using /start <key> to rejoin.";
          bot.api.sendMessage(Number(user.telegramId), msg, { parse_mode: 'HTML' }).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 50));
      }
      if (bannedCount > 0) {
        bot.api.sendMessage(config.CONTROL_GROUP_ID, `🤖 <b>Autoban Report:</b> Banned ${bannedCount} users for being inactive for 36 hours.`, { parse_mode: 'HTML' }).catch(() => {});
      }
    }
  });

  // 03:00 UTC - Warn shutdown
  cron.schedule('0 3 * * *', async () => {
    console.log('Running 03:00 UTC Job: Broadcasting shutdown warning');
    const eligibleUsers = await prisma.user.findMany({ where: { isBanned: false, hasBlockedBot: false } });
    const msg = "🌙 <b>Attention!</b> The bot has stopped receiving media for the night. You have <b>30 minutes</b> to save any media you want to keep. After that, all media sent today will be deleted! ⏳";
    bot.api.sendMessage(config.CONTROL_GROUP_ID, msg, { parse_mode: 'HTML' }).catch(console.error);
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
    bot.api.sendMessage(config.CONTROL_GROUP_ID, msg, { parse_mode: 'HTML' }).catch(console.error);
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
