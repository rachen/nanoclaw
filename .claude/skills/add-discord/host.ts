/**
 * Discord Integration IPC Handler
 *
 * Handles all discord_* IPC messages from container agents.
 * This runs on the host machine and uses discord.js to interact with Discord.
 *
 * SETUP REQUIRED:
 * 1. Create Discord bot at https://discord.com/developers/applications
 * 2. Enable MESSAGE CONTENT INTENT in Bot settings (privileged)
 * 3. Add DISCORD_BOT_TOKEN to .env
 * 4. Invite bot to server with Send Messages permission
 */

import fs from 'node:fs';
import path from 'node:path';

import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
});

interface SkillResult {
  success: boolean;
  message: string;
  data?: unknown;
}

let discordClient: Client | null = null;
let clientReady = false;

export async function initDiscordClient(): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.warn('DISCORD_BOT_TOKEN not set - Discord integration disabled');
    return false;
  }

  if (discordClient && clientReady) {
    return true;
  }

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const client = discordClient;
  return new Promise((resolve) => {
    client.once('ready', () => {
      clientReady = true;
      logger.info({ user: client.user?.tag }, 'Discord bot connected');
      resolve(true);
    });

    client.once('error', (err) => {
      logger.error({ err }, 'Discord client error');
      resolve(false);
    });

    client.login(token).catch((err) => {
      logger.error({ err }, 'Failed to login to Discord');
      resolve(false);
    });
  });
}

function writeResult(
  dataDir: string,
  sourceGroup: string,
  requestId: string,
  result: SkillResult,
): void {
  const resultsDir = path.join(dataDir, 'ipc', sourceGroup, 'discord_results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, `${requestId}.json`),
    JSON.stringify(result),
  );
}

async function sendDiscordMessage(
  channelId: string,
  content: string,
): Promise<SkillResult> {
  if (!discordClient || !clientReady) {
    const initialized = await initDiscordClient();
    if (!initialized) {
      return {
        success: false,
        message: 'Discord client not initialized. Check DISCORD_BOT_TOKEN.',
      };
    }
  }

  if (!discordClient) {
    return { success: false, message: 'Discord client not available' };
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      return {
        success: false,
        message: `Channel ${channelId} not found or not a text channel`,
      };
    }

    if (content.length <= 2000) {
      await channel.send(content);
    } else {
      const chunks = splitMessage(content, 2000);
      for (const chunk of chunks) {
        await channel.send(chunk);
      }
    }

    return { success: true, message: `Message sent to channel ${channelId}` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to send message: ${errorMsg}` };
  }
}

async function sendDiscordReply(
  channelId: string,
  messageId: string,
  content: string,
): Promise<SkillResult> {
  if (!discordClient || !clientReady) {
    const initialized = await initDiscordClient();
    if (!initialized) {
      return {
        success: false,
        message: 'Discord client not initialized. Check DISCORD_BOT_TOKEN.',
      };
    }
  }

  if (!discordClient) {
    return { success: false, message: 'Discord client not available' };
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      return {
        success: false,
        message: `Channel ${channelId} not found or not a text channel`,
      };
    }

    const message = await channel.messages.fetch(messageId);
    if (!message) {
      return { success: false, message: `Message ${messageId} not found` };
    }

    await message.reply(content.slice(0, 2000));
    return { success: true, message: `Reply sent to message ${messageId}` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to send reply: ${errorMsg}` };
  }
}

async function addDiscordReaction(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<SkillResult> {
  if (!discordClient || !clientReady) {
    const initialized = await initDiscordClient();
    if (!initialized) {
      return {
        success: false,
        message: 'Discord client not initialized. Check DISCORD_BOT_TOKEN.',
      };
    }
  }

  if (!discordClient) {
    return { success: false, message: 'Discord client not available' };
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      return {
        success: false,
        message: `Channel ${channelId} not found or not a text channel`,
      };
    }

    const message = await channel.messages.fetch(messageId);
    if (!message) {
      return { success: false, message: `Message ${messageId} not found` };
    }

    await message.react(emoji);
    return {
      success: true,
      message: `Reaction ${emoji} added to message ${messageId}`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to add reaction: ${errorMsg}` };
  }
}

function splitMessage(content: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

export async function handleDiscordIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  _isMain: boolean,
  dataDir: string,
): Promise<boolean> {
  const type = data.type as string;

  if (!type?.startsWith('discord_')) {
    return false;
  }

  const requestId = data.requestId as string;
  if (!requestId) {
    logger.warn({ type }, 'Discord IPC blocked: missing requestId');
    return true;
  }

  logger.info({ type, requestId, sourceGroup }, 'Processing Discord request');

  let result: SkillResult;

  switch (type) {
    case 'discord_send':
      if (!data.channelId || !data.content) {
        result = { success: false, message: 'Missing channelId or content' };
        break;
      }
      result = await sendDiscordMessage(
        data.channelId as string,
        data.content as string,
      );
      break;

    case 'discord_reply':
      if (!data.channelId || !data.messageId || !data.content) {
        result = {
          success: false,
          message: 'Missing channelId, messageId, or content',
        };
        break;
      }
      result = await sendDiscordReply(
        data.channelId as string,
        data.messageId as string,
        data.content as string,
      );
      break;

    case 'discord_react':
      if (!data.channelId || !data.messageId || !data.emoji) {
        result = {
          success: false,
          message: 'Missing channelId, messageId, or emoji',
        };
        break;
      }
      result = await addDiscordReaction(
        data.channelId as string,
        data.messageId as string,
        data.emoji as string,
      );
      break;

    default:
      return false;
  }

  writeResult(dataDir, sourceGroup, requestId, result);

  if (result.success) {
    logger.info({ type, requestId }, 'Discord request completed');
  } else {
    logger.error(
      { type, requestId, message: result.message },
      'Discord request failed',
    );
  }

  return true;
}

export function getDiscordClient(): Client | null {
  return discordClient;
}

export function isDiscordReady(): boolean {
  return clientReady;
}
