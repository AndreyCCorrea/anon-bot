import { bot, sendWithRetry } from './bot';
import { prisma } from './db';
import { run } from '@grammyjs/runner';
import { initScheduler } from './scheduler';
import { config } from './config';

async function bootstrap() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    
    console.log('Registering bot commands...');
    await bot.api.setMyCommands([
      { command: 'start', description: 'Start the bot' }
    ]);
    
    await bot.api.setMyCommands([
      { command: 'ban', description: 'Ban a user' },
      { command: 'unban', description: 'Unban a user' },
      { command: 'newkey', description: 'Generate a new access key' },
      { command: 'closegroup', description: 'Revoke all access keys' },
      { command: 'status', description: 'Bot Status Report' },
      { command: 'share', description: 'Get share link' }
    ], { scope: { type: 'chat', chat_id: config.ADMIN_USER_ID } });

    console.log('Starting bot...');
    await bot.init();
    const runner = run(bot);
    console.log(`Bot @${bot.botInfo.username} started successfully with grammy runner.`);
    
    initScheduler();
    
    // Broadcast server restart to users (if not during sleep hours)
    (async () => {
      const utcHour = new Date().getUTCHours();
      if (utcHour >= 3 && utcHour < 9) return; // Silent during sleep window
      
      // Small delay to allow container network to stabilize
      await new Promise(r => setTimeout(r, 2000));

      console.log('Broadcasting server restart message...');
      const eligibleUsers = await prisma.user.findMany({ where: { isBanned: false, hasBlockedBot: false } });
      const startupMsg = "🤖 <b>We are back online!</b> The server experienced a brief interruption, but the bot is now fully operational again! 🚀✨";
      
      sendWithRetry(config.ADMIN_USER_ID, startupMsg, { parse_mode: 'HTML' }).catch(() => {});
      
      for (const user of eligibleUsers) {
        if (user.telegramId === BigInt(config.ADMIN_USER_ID)) continue;
        sendWithRetry(Number(user.telegramId), startupMsg, { parse_mode: 'HTML' }).catch(async (err: any) => {
          if (err?.error_code === 403) {
            await prisma.user.update({ where: { telegramId: user.telegramId }, data: { hasBlockedBot: true } }).catch(() => {});
          }
        });
        await new Promise(r => setTimeout(r, 50));
      }
    })();

    const stopRunner = () => runner.isRunning() && runner.stop();
    process.once("SIGINT", stopRunner);
    process.once("SIGTERM", stopRunner);
  } catch (err) {
    console.error('Failed to start:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
