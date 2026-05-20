import { bot } from './bot';
import { prisma } from './db';
import { run } from '@grammyjs/runner';
import { initScheduler } from './scheduler';

async function bootstrap() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Starting bot...');
    await bot.init();
    const runner = run(bot);
    console.log(`Bot @${bot.botInfo.username} started successfully with grammy runner.`);
    
    initScheduler();
    
    // Broadcast server restart to users (if not during sleep hours)
    (async () => {
      const utcHour = new Date().getUTCHours();
      if (utcHour >= 3 && utcHour < 9) return; // Silent during sleep window
      
      console.log('Broadcasting server restart message...');
      const eligibleUsers = await prisma.user.findMany({ where: { isBanned: false, hasBlockedBot: false } });
      const startupMsg = "🤖 <b>We are back online!</b> The server experienced a brief interruption, but the bot is now fully operational again! 🚀✨";
      
      for (const user of eligibleUsers) {
        bot.api.sendMessage(Number(user.telegramId), startupMsg, { parse_mode: 'HTML' }).catch(async (err: any) => {
          if (err.error_code === 403) {
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
