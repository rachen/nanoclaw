# Host Modification Request (Example)

## Summary
Add Telegram integration as a new communication channel alongside WhatsApp and Discord.

## Context
User wants to receive notifications and send commands via Telegram. This requires:
- Installing telegram bot dependencies
- Adding Telegram bot initialization to src/index.ts
- Creating IPC handlers for sending Telegram messages
- Updating types for Telegram JID format

## Changes Required

### 1. Install Dependencies
**Files affected:** `package.json`

**What to do:**
```bash
npm install node-telegram-bot-api
npm install --save-dev @types/node-telegram-bot-api
```

### 2. Add Telegram Configuration
**Files affected:** `src/config.ts`

**What to do:**
Add new environment variable:
```typescript
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
```

### 3. Add Telegram Bot Initialization
**Files affected:** `src/index.ts`

**What to do:**
Add import at top:
```typescript
import TelegramBot from 'node-telegram-bot-api';
```

Add bot initialization in main():
```typescript
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

telegramBot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const content = msg.text || '';
  const jid = `telegram:${chatId}`;

  // Process similar to WhatsApp messages
  await processMessage({
    chat_jid: jid,
    content,
    sender_name: msg.from?.first_name || 'User',
    timestamp: new Date(msg.date * 1000).toISOString(),
  });
});
```

### 4. Update JID Handling
**Files affected:** `src/index.ts` (sendMessage function)

**What to do:**
Add Telegram case to sendMessage():
```typescript
if (jid.startsWith('telegram:')) {
  const chatId = parseInt(jid.replace('telegram:', ''));
  await telegramBot.sendMessage(chatId, text);
  return;
}
```

### 5. Update Environment Variables
**Files affected:** `~/Library/LaunchAgents/com.nanoclaw.plist`

**What to do:**
Add to EnvironmentVariables section:
```xml
<key>TELEGRAM_BOT_TOKEN</key>
<string>YOUR_BOT_TOKEN_HERE</string>
```

## Testing
1. Restart service: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist && launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist`
2. Send a test message to your Telegram bot
3. Verify bot responds with fast ack and full response
4. Check logs: `tail -f ~/Library/Logs/com.nanoclaw.log`

## Rollback
1. Revert changes in src/index.ts and src/config.ts
2. `npm uninstall node-telegram-bot-api @types/node-telegram-bot-api`
3. Rebuild: `npm run build`
4. Restart service
