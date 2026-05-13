import { Bot, Context, InlineKeyboard } from 'grammy';
import { config } from './config';
import { prisma, generateRandomName, generateAccessKey } from './db';

export const bot = new Bot(config.BOT_TOKEN);

const REQUIRED_MEDIA_COUNT = 10;
const INACTIVITY_LIMIT_MS = 12 * 60 * 60 * 1000; // 12 hours

// In-memory buffer for media groups
const mediaGroups = new Map<string, { messageIds: number[], timeout: NodeJS.Timeout }>();

async function getActiveKey(): Promise<string | null> {
  const key = await prisma.accessKey.findFirst({
    where: { isRevoked: false },
    orderBy: { createdAt: 'desc' }
  });
  return key ? key.key : null;
}

// Middleware to inject user object if exists
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const user = await prisma.user.findUnique({
      where: { telegramId: ctx.from.id }
    });
    (ctx as any).session = { user }; // Note: not actually using grammy sessions, just attaching to ctx
  }
  await next();
});

// Start command
bot.command('start', async (ctx) => {
  const user = (ctx as any).session?.user;
  const payload = ctx.match; // The part after /start
  const currentKey = await getActiveKey();

  if (user) {
    if (user.isBanned) {
      if (payload) {
        const accessKey = await prisma.accessKey.findUnique({ where: { key: payload } });
        if (accessKey && !accessKey.isRevoked && accessKey.usageCount < 500) {
          await prisma.user.update({ where: { id: user.id }, data: { isBanned: false } });
          await prisma.accessKey.update({ where: { id: accessKey.id }, data: { usageCount: { increment: 1 } } });
          user.isBanned = false;
          await ctx.reply('Your access key is valid. You have been unbanned.');
        } else {
          return ctx.reply('You are banned. Provide a new valid access key to be unbanned.');
        }
      } else {
        return ctx.reply('You are banned. Provide a new valid access key to be unbanned.');
      }
    }
    // Authenticated user
    let shareUrl = `https://t.me/${ctx.me.username}`;
    if (currentKey) {
      shareUrl += `?start=${currentKey}`;
    }
    
    const keyboard = new InlineKeyboard().url('Share Bot', `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}`);
    return ctx.reply(`Welcome back, ${user.randomName}!`, { reply_markup: keyboard });
  }

  // Not authenticated
  if (!payload) {
    return ctx.reply('Welcome! Please provide a valid access key to join.');
  }

  const accessKey = await prisma.accessKey.findUnique({
    where: { key: payload }
  });

  if (!accessKey || accessKey.isRevoked) {
    return ctx.reply('Invalid or revoked access key.');
  }

  if (accessKey.usageCount >= 500) {
    return ctx.reply('This access key has reached its usage limit.');
  }

  // Register user
  const newUser = await prisma.user.create({
    data: {
      telegramId: ctx.from!.id,
      randomName: generateRandomName(),
    }
  });

  await prisma.accessKey.update({
    where: { id: accessKey.id },
    data: { usageCount: { increment: 1 } }
  });

  const shareUrl = `https://t.me/${ctx.me.username}?start=${currentKey}`;
  const keyboard = new InlineKeyboard().url('Share Bot', `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}`);
  
  await ctx.reply(`Authentication successful! You have been assigned the name ${newUser.randomName}.\n\nYou must send 10 media files to begin receiving media from others.`, { reply_markup: keyboard });
});

// Admin commands middleware
const adminFilter = bot.filter(ctx => ctx.chat?.id === config.ADMIN_GROUP_ID);

adminFilter.command('ban', async (ctx) => {
  const args = ctx.match.split(' ');
  if (args.length < 1 || !args[0]) return ctx.reply('Usage: /ban <userId>');
  const telegramId = parseInt(args[0], 10);
  
  await prisma.user.update({
    where: { telegramId },
    data: { isBanned: true }
  });
  await ctx.reply(`User ${telegramId} has been banned.`);
});

adminFilter.command('unban', async (ctx) => {
  const args = ctx.match.split(' ');
  if (args.length < 1 || !args[0]) return ctx.reply('Usage: /unban <userId>');
  const telegramId = parseInt(args[0], 10);
  
  await prisma.user.update({
    where: { telegramId },
    data: { isBanned: false }
  });
  await ctx.reply(`User ${telegramId} has been unbanned.`);
});

adminFilter.command('newkey', async (ctx) => {
  // Revoke previous keys (optional, but requested in behavior to have one active key)
  await prisma.accessKey.updateMany({
    where: { isRevoked: false },
    data: { isRevoked: true }
  });

  const newKey = generateAccessKey();
  await prisma.accessKey.create({
    data: { key: newKey }
  });
  await ctx.reply(`New access key generated: <code>${newKey}</code>\n\nLink: https://t.me/${ctx.me.username}?start=${newKey}`, { parse_mode: 'HTML' });
});

adminFilter.command('closegroup', async (ctx) => {
  await prisma.accessKey.updateMany({
    where: { isRevoked: false },
    data: { isRevoked: true }
  });
  await ctx.reply('All access keys have been revoked. No new users can join until /newkey is used.');
});

// Main media handler for users
bot.on(['message:photo', 'message:video', 'message:document'], async (ctx) => {
  const user = (ctx as any).session?.user;
  if (!user || user.isBanned) return;

  // Track activity
  const now = new Date();
  let mediaSentCount = user.mediaSentCount + 1;
  
  const timeSinceLastMedia = user.lastMediaSentAt ? now.getTime() - new Date(user.lastMediaSentAt).getTime() : 0;
  if (user.lastMediaSentAt && timeSinceLastMedia > INACTIVITY_LIMIT_MS) {
    // Reset count to 1 if they were inactive for > 12 hours
    mediaSentCount = 1;
    await ctx.reply('You were inactive for more than 12 hours. You must send 10 media files again to start receiving media.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { 
      mediaSentCount,
      lastMediaSentAt: now
    }
  });

  if (mediaSentCount === REQUIRED_MEDIA_COUNT) {
    await ctx.reply('You have sent 10 media files! You will now receive media from other users.');
  }

  // Handle Album Grouping
  const mediaGroupId = ctx.message.media_group_id;
  if (mediaGroupId) {
    if (!mediaGroups.has(mediaGroupId)) {
      const timeout = setTimeout(() => {
        processMediaGroup(mediaGroupId, ctx.from!.id, user);
      }, 1000);
      mediaGroups.set(mediaGroupId, { messageIds: [ctx.message.message_id], timeout });
    } else {
      mediaGroups.get(mediaGroupId)!.messageIds.push(ctx.message.message_id);
    }
  } else {
    // Single media
    await distributeMedia([ctx.message.message_id], ctx.from!.id, user);
  }
});

async function processMediaGroup(mediaGroupId: string, fromChatId: number, sender: any) {
  const group = mediaGroups.get(mediaGroupId);
  if (!group) return;
  mediaGroups.delete(mediaGroupId);
  await distributeMedia(group.messageIds, fromChatId, sender);
}

async function distributeMedia(messageIds: number[], fromChatId: number, sender: any) {
  // Send to Admin Group
  try {
    await bot.api.sendMessage(config.ADMIN_GROUP_ID, `Media from ${sender.randomName} (ID: <code>${sender.telegramId}</code>)`, { parse_mode: 'HTML' });
    await bot.api.copyMessages(config.ADMIN_GROUP_ID, fromChatId, messageIds);
  } catch (err) {
    console.error('Failed to send to admin group:', err);
  }

  // Find eligible users: sent >= 10 media, not banned, active within last 12h
  const twelveHoursAgo = new Date(Date.now() - INACTIVITY_LIMIT_MS);
  const eligibleUsers = await prisma.user.findMany({
    where: {
      isBanned: false,
      mediaSentCount: { gte: REQUIRED_MEDIA_COUNT },
      lastMediaSentAt: { gt: twelveHoursAgo },
      telegramId: { not: sender.telegramId } // don't send to self
    }
  });

  // Distribute to eligible users
  for (const user of eligibleUsers) {
    try {
      await bot.api.sendMessage(Number(user.telegramId), `From: ${sender.randomName}`);
      await bot.api.copyMessages(Number(user.telegramId), fromChatId, messageIds);
      // Wait a bit to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      console.error(`Failed to send to user ${user.telegramId}:`, err);
    }
  }
}

// Error handler
bot.catch((err) => {
  console.error('Error in bot:', err);
});
