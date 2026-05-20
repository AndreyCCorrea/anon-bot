import { Bot, Context, InlineKeyboard } from 'grammy';
import { config } from './config';
import { prisma, generateRandomName, generateAccessKey } from './db';
import { insertMedia } from './mediaDb';

export const bot = new Bot(config.BOT_TOKEN);

const REQUIRED_MEDIA_COUNT = 10;
const INACTIVITY_LIMIT_MS = 12 * 60 * 60 * 1000; // 12 hours

// In-memory buffer for media groups
const mediaGroups = new Map<string, { items: any[], timeout: NodeJS.Timeout }>();

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
    if (user && user.hasBlockedBot) {
      await prisma.user.update({ where: { id: user.id }, data: { hasBlockedBot: false } });
      user.hasBlockedBot = false;
    }
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
          if (user.bannedOnKeyId && user.bannedOnKeyId === accessKey.id) {
            return ctx.reply('🚫 You were banned while using this key. You must wait for a new key to rejoin.');
          }

          await prisma.user.update({ 
            where: { id: user.id }, 
            data: { 
              isBanned: false,
              bannedAt: null,
              bannedOnKeyId: null
            } 
          });
          const updatedKey = await prisma.accessKey.update({ where: { id: accessKey.id }, data: { usageCount: { increment: 1 } } });
          if (updatedKey.usageCount >= 500) {
            bot.api.sendMessage(config.ADMIN_GROUP_ID, `⚠️ <b>ALERT:</b> The access key <code>${updatedKey.key}</code> has exhausted all its 500 slots. Please generate a new key using /newkey! 🔑`, { parse_mode: 'HTML' }).catch(console.error);
          }
          user.isBanned = false;
          await ctx.reply('✅ Your new access key is valid. You have been unbanned.');
        } else {
          return ctx.reply('🚫 You are banned. Provide a new valid access key to be unbanned.');
        }
      } else {
        return ctx.reply('🚫 You are banned. Provide a new valid access key to be unbanned.');
      }
    }
    // Authenticated user
    let shareUrl = `https://t.me/${ctx.me.username}`;
    if (currentKey) {
      shareUrl += `?start=${currentKey}`;
    }
    
    const keyboard = new InlineKeyboard().url('🚀 Share Bot', `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}`);
    if (config.BACKUP_LINK) {
      keyboard.url('🛡️ Backup', config.BACKUP_LINK);
    }
    
    const msg = `👋 Welcome back, <b>${user.randomName}</b>!\n\n⚠️ Please save our Backup Link in case this bot stops working.`;
    return ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'HTML' });
  }

  // Not authenticated
  if (!payload) {
    return ctx.reply('👋 Welcome! Please provide a valid access key to join.');
  }

  const accessKey = await prisma.accessKey.findUnique({
    where: { key: payload }
  });

  if (!accessKey || accessKey.isRevoked) {
    return ctx.reply('❌ Invalid or revoked access key.');
  }

  if (accessKey.usageCount >= 500) {
    return ctx.reply('⚠️ This access key has reached its usage limit.');
  }

  // Register user
  const newUser = await prisma.user.create({
    data: {
      telegramId: ctx.from!.id,
      randomName: generateRandomName(),
    }
  });

  const updatedKey = await prisma.accessKey.update({
    where: { id: accessKey.id },
    data: { usageCount: { increment: 1 } }
  });

  if (updatedKey.usageCount >= 500) {
    bot.api.sendMessage(config.ADMIN_GROUP_ID, `⚠️ <b>ALERT:</b> The access key <code>${updatedKey.key}</code> has exhausted all its 500 slots. Please generate a new key using /newkey! 🔑`, { parse_mode: 'HTML' }).catch(console.error);
  }

  const shareUrl = `https://t.me/${ctx.me.username}?start=${currentKey}`;
  const keyboard = new InlineKeyboard().url('🚀 Share Bot', `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}`);
  if (config.BACKUP_LINK) {
    keyboard.url('🛡️ Backup', config.BACKUP_LINK);
  }
  
  const msg = `✅ Authentication successful! You have been assigned the name <b>${newUser.randomName}</b>.\n\n⚠️ Please save our Backup Link in case this bot stops working.\n\n📸 You must send 10 media files to begin receiving media from others.`;
  await ctx.reply(msg, { reply_markup: keyboard, parse_mode: 'HTML' });
});

// Admin commands middleware
const adminFilter = bot.filter(ctx => ctx.chat?.id === config.ADMIN_GROUP_ID);

adminFilter.command('ban', async (ctx) => {
  const args = ctx.match.split(' ');
  if (args.length < 1 || !args[0]) return ctx.reply('Usage: /ban <userId>');
  const telegramId = parseInt(args[0], 10);
  
  const activeKey = await prisma.accessKey.findFirst({
    where: { isRevoked: false },
    orderBy: { createdAt: 'desc' }
  });

  await prisma.user.update({
    where: { telegramId },
    data: { 
      isBanned: true,
      bannedAt: new Date(),
      bannedOnKeyId: activeKey ? activeKey.id : null
    }
  });
  await ctx.reply(`🚫 User ${telegramId} has been banned.`);
});

adminFilter.command('unban', async (ctx) => {
  const args = ctx.match.split(' ');
  if (args.length < 1 || !args[0]) return ctx.reply('Usage: /unban <userId>');
  const telegramId = parseInt(args[0], 10);
  
  await prisma.user.update({
    where: { telegramId },
    data: { 
      isBanned: false,
      bannedAt: null,
      bannedOnKeyId: null
    }
  });
  await ctx.reply(`✅ User ${telegramId} has been unbanned.`);
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
  await ctx.reply(`🔑 New access key generated: <code>${newKey}</code>\n\nLink: https://t.me/${ctx.me.username}?start=${newKey}`, { parse_mode: 'HTML' });
});

adminFilter.command('closegroup', async (ctx) => {
  await prisma.accessKey.updateMany({
    where: { isRevoked: false },
    data: { isRevoked: true }
  });
  await ctx.reply('🔒 All access keys have been revoked. No new users can join until /newkey is used.');
});

// Main media handler for users
bot.on(['message:photo', 'message:video', 'message:document'], async (ctx) => {
  const utcHour = new Date().getUTCHours();
  if (utcHour >= 3 && utcHour < 9) {
    return ctx.reply('🚫 <b>Sorry!</b> The bot has stopped receiving media for the night. We will resume at 09:00 AM UTC! 🌙✨', { parse_mode: 'HTML' });
  }

  const user = (ctx as any).session?.user;
  if (!user || user.isBanned) return;

  // Track activity
  const now = new Date();
  let mediaSentCount = user.mediaSentCount + 1;
  
  const timeSinceLastMedia = user.lastMediaSentAt ? now.getTime() - new Date(user.lastMediaSentAt).getTime() : 0;
  if (user.lastMediaSentAt && timeSinceLastMedia > INACTIVITY_LIMIT_MS) {
    // Reset count to 1 if they were inactive for > 12 hours
    mediaSentCount = 1;
    await ctx.reply('⏳ You were inactive for more than 12 hours. You must send 10 media files again to start receiving media.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { 
      mediaSentCount,
      lastMediaSentAt: now
    }
  });

  if (mediaSentCount === REQUIRED_MEDIA_COUNT) {
    await ctx.reply('🎉 You have sent 10 media files! You will now receive media from other users.');
  }

  let inputMedia: any = {};
  if (ctx.message.photo) {
    inputMedia = { 
      type: 'photo', 
      media: ctx.message.photo[ctx.message.photo.length - 1].file_id, 
      caption: ctx.message.caption, 
      caption_entities: ctx.message.caption_entities 
    };
  } else if (ctx.message.video) {
    inputMedia = { 
      type: 'video', 
      media: ctx.message.video.file_id, 
      caption: ctx.message.caption, 
      caption_entities: ctx.message.caption_entities 
    };
  } else if (ctx.message.document) {
    inputMedia = { 
      type: 'document', 
      media: ctx.message.document.file_id, 
      caption: ctx.message.caption, 
      caption_entities: ctx.message.caption_entities 
    };
  }

  // Handle Album Grouping
  const mediaGroupId = ctx.message.media_group_id;
  if (mediaGroupId) {
    if (!mediaGroups.has(mediaGroupId)) {
      const timeout = setTimeout(() => {
        processMediaGroup(mediaGroupId, ctx.from!.id, user).catch(err => {
          console.error('Error processing media group:', err);
        });
      }, 1000);
      mediaGroups.set(mediaGroupId, { items: [inputMedia], timeout });
    } else {
      mediaGroups.get(mediaGroupId)!.items.push(inputMedia);
    }
  } else {
    // Single media
    distributeMedia([inputMedia], ctx.from!.id, user).catch(err => {
      console.error('Error distributing media:', err);
    });
  }
});

async function processMediaGroup(mediaGroupId: string, fromChatId: number, sender: any) {
  const group = mediaGroups.get(mediaGroupId);
  if (!group) return;
  mediaGroups.delete(mediaGroupId);
  await distributeMedia(group.items, fromChatId, sender);
}

async function distributeMedia(items: any[], fromChatId: number, sender: any) {
  const adminItems = JSON.parse(JSON.stringify(items));
  const userItems = JSON.parse(JSON.stringify(items));

  const adminCaptionAddition = `\n\n👤 <b>De:</b> ${sender.randomName} (ID: <code>${sender.telegramId}</code>)`;
  const userCaptionAddition = `\n\n👤 <b>De:</b> ${sender.randomName}`;

  if (adminItems[0].caption) {
    adminItems[0].caption = escapeHtml(adminItems[0].caption) + adminCaptionAddition;
    adminItems[0].parse_mode = 'HTML';
    delete adminItems[0].caption_entities;

    userItems[0].caption = escapeHtml(userItems[0].caption) + userCaptionAddition;
    userItems[0].parse_mode = 'HTML';
    delete userItems[0].caption_entities;
  } else {
    adminItems[0].caption = adminCaptionAddition.trim();
    adminItems[0].parse_mode = 'HTML';
    userItems[0].caption = userCaptionAddition.trim();
    userItems[0].parse_mode = 'HTML';
  }

  // Send to Admin Group
  try {
    if (adminItems.length > 1) {
      await bot.api.sendMediaGroup(config.ADMIN_GROUP_ID, adminItems);
    } else {
      const item = adminItems[0];
      if (item.type === 'photo') await bot.api.sendPhoto(config.ADMIN_GROUP_ID, item.media, { caption: item.caption, parse_mode: 'HTML' });
      else if (item.type === 'video') await bot.api.sendVideo(config.ADMIN_GROUP_ID, item.media, { caption: item.caption, parse_mode: 'HTML' });
      else if (item.type === 'document') await bot.api.sendDocument(config.ADMIN_GROUP_ID, item.media, { caption: item.caption, parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Failed to send to admin group:', err);
  }

  // Find eligible users: sent >= 10 media, not banned, active within last 12h
  const twelveHoursAgo = new Date(Date.now() - INACTIVITY_LIMIT_MS);
  const eligibleUsers = await prisma.user.findMany({
    where: {
      isBanned: false,
      hasBlockedBot: false,
      mediaSentCount: { gte: REQUIRED_MEDIA_COUNT },
      lastMediaSentAt: { gt: twelveHoursAgo },
      telegramId: { not: sender.telegramId } // don't send to self
    }
  });

  // Distribute to eligible users
  for (const user of eligibleUsers) {
    try {
      if (userItems.length > 1) {
        const msgs = await bot.api.sendMediaGroup(Number(user.telegramId), userItems);
        msgs.forEach(m => insertMedia(user.telegramId.toString(), m.message_id));
      } else {
        const item = userItems[0];
        let msg;
        if (item.type === 'photo') msg = await bot.api.sendPhoto(Number(user.telegramId), item.media, { caption: item.caption, parse_mode: 'HTML' });
        else if (item.type === 'video') msg = await bot.api.sendVideo(Number(user.telegramId), item.media, { caption: item.caption, parse_mode: 'HTML' });
        else if (item.type === 'document') msg = await bot.api.sendDocument(Number(user.telegramId), item.media, { caption: item.caption, parse_mode: 'HTML' });
        if (msg) insertMedia(user.telegramId.toString(), msg.message_id);
      }
      // Wait a bit to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err: any) {
      if (err.error_code === 403) {
        await prisma.user.update({ where: { telegramId: user.telegramId }, data: { hasBlockedBot: true } }).catch(() => {});
      } else {
        console.error(`Failed to send to user ${user.telegramId}:`, err);
      }
    }
  }
}

// Error handler
bot.catch((err) => {
  console.error('Error in bot:', err);
});
