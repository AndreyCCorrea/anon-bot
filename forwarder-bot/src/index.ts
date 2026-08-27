import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import dotenv from 'dotenv';

dotenv.config();

const apiId = parseInt(process.env.API_ID || '0', 10);
const apiHash = process.env.API_HASH || '';
const stringSession = process.env.STRING_SESSION || '';
const sourceChatId = process.env.SOURCE_CHAT_ID ? process.env.SOURCE_CHAT_ID.trim() : '';
const targetGroupId = process.env.TARGET_GROUP_ID ? process.env.TARGET_GROUP_ID.trim() : '';

if (!apiId || !apiHash) {
  console.error('❌ API_ID and API_HASH are required in environment variables.');
  process.exit(1);
}

if (!stringSession) {
  console.error('❌ STRING_SESSION is required in environment variables.');
  process.exit(1);
}

if (!targetGroupId) {
  console.error('❌ TARGET_GROUP_ID is required in environment variables.');
  process.exit(1);
}

const session = new StringSession(stringSession);
const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});

async function main() {
  console.log('🔄 Connecting to Telegram Userbot...');
  await client.connect();
  
  const me = await client.getMe();
  console.log(`✅ Logged in as: ${(me as Api.User).firstName || 'User'} (ID: ${(me as Api.User).id})`);

  console.log(`🎧 Listening for messages from ${sourceChatId ? `source chat: ${sourceChatId}` : 'all chats'}...`);
  console.log(`➡️ Target forwarding group: ${targetGroupId}`);

  client.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    if (!message) return;

    // Check sender/chat ID if SOURCE_CHAT_ID is set
    if (sourceChatId) {
      const senderId = message.senderId?.toString();
      const chatId = message.chatId?.toString();
      const peerId = message.peerId ? (message.peerId as any).userId?.toString() || (message.peerId as any).channelId?.toString() || (message.peerId as any).chatId?.toString() : null;

      const isMatch = senderId === sourceChatId || chatId === sourceChatId || peerId === sourceChatId;
      if (!isMatch) return;
    }

    // Check if the message contains photo, video, or document media
    const media = message.media;
    if (!media) return;

    // Ignore web page link preview media
    if (media instanceof Api.MessageMediaWebPage) return;

    const isPhoto = media instanceof Api.MessageMediaPhoto || Boolean(message.photo);
    const isDocument = media instanceof Api.MessageMediaDocument || Boolean(message.document) || Boolean(message.video);

    if (!isPhoto && !isDocument) return;

    console.log(`📸 Media detected in message ${message.id}! Forwarding to target group ${targetGroupId}...`);

    try {
      // Forward the media message to the target group without author header
      await client.forwardMessages(targetGroupId, {
        messages: [message.id],
        fromPeer: message.peerId || message.chatId || message.senderId,
        dropAuthor: true,
      });
      console.log(`✅ Message ${message.id} forwarded successfully without author mention.`);
    } catch (err) {
      console.error(`❌ Failed to forward message ${message.id}:`, err);
    }
  }, new NewMessage({}));
}

main().catch(err => {
  console.error('❌ Error starting Forwarder Bot:', err);
  process.exit(1);
});
