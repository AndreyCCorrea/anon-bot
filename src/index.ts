import { bot } from './bot';
import { prisma } from './db';

async function bootstrap() {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Starting bot...');
    await bot.start({
      onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} started successfully.`);
      }
    });
  } catch (err) {
    console.error('Failed to start:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
