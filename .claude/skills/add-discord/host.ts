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

async function editDiscordMessage(
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

    await message.edit(content.slice(0, 2000));
    return { success: true, message: `Message ${messageId} edited` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to edit message: ${errorMsg}` };
  }
}

async function deleteDiscordMessage(
  channelId: string,
  messageId: string,
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

    await message.delete();
    return { success: true, message: `Message ${messageId} deleted` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to delete message: ${errorMsg}` };
  }
}

async function pinDiscordMessage(
  channelId: string,
  messageId: string,
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

    await message.pin();
    return { success: true, message: `Message ${messageId} pinned` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to pin message: ${errorMsg}` };
  }
}

async function unpinDiscordMessage(
  channelId: string,
  messageId: string,
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

    await message.unpin();
    return { success: true, message: `Message ${messageId} unpinned` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to unpin message: ${errorMsg}` };
  }
}

async function getDiscordMessages(
  channelId: string,
  limit: number,
  before?: string,
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

    const options: { limit: number; before?: string } = { limit };
    if (before) options.before = before;

    const messages = await channel.messages.fetch(options);
    const messageList = messages.map((msg) => ({
      id: msg.id,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        bot: msg.author.bot,
      },
      content: msg.content,
      timestamp: msg.createdAt.toISOString(),
      edited: msg.editedAt?.toISOString() || null,
    }));

    return {
      success: true,
      message: `Retrieved ${messageList.length} messages`,
      data: messageList,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to fetch messages: ${errorMsg}`,
    };
  }
}

async function createDiscordThread(
  channelId: string,
  name: string,
  messageId?: string,
  autoArchiveDuration?: number,
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

    let thread: any;
    if (messageId) {
      const message = await channel.messages.fetch(messageId);
      thread = await message.startThread({
        name,
        autoArchiveDuration: autoArchiveDuration as any,
      });
    } else {
      thread = await channel.threads.create({
        name,
        autoArchiveDuration: autoArchiveDuration as any,
      });
    }

    return {
      success: true,
      message: `Thread created: ${thread.name}`,
      data: { id: thread.id, name: thread.name },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to create thread: ${errorMsg}`,
    };
  }
}

async function listDiscordChannels(guildId: string): Promise<SkillResult> {
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
    const guild = await discordClient.guilds.fetch(guildId);
    if (!guild) {
      return { success: false, message: `Guild ${guildId} not found` };
    }

    const channels = await guild.channels.fetch();
    const channelList = channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
    }));

    return {
      success: true,
      message: `Found ${channelList.length} channels`,
      data: channelList,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to list channels: ${errorMsg}`,
    };
  }
}

async function getDiscordChannelInfo(channelId: string): Promise<SkillResult> {
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
    if (!channel) {
      return { success: false, message: `Channel ${channelId} not found` };
    }

    const info: any = {
      id: channel.id,
      type: channel.type,
    };

    if (channel instanceof TextChannel) {
      info.name = channel.name;
      info.topic = channel.topic;
      info.nsfw = channel.nsfw;
      info.guild = channel.guild.name;
    }

    return {
      success: true,
      message: `Channel info retrieved`,
      data: info,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to get channel info: ${errorMsg}`,
    };
  }
}

async function getDiscordUser(userId: string): Promise<SkillResult> {
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
    const user = await discordClient.users.fetch(userId);
    if (!user) {
      return { success: false, message: `User ${userId} not found` };
    }

    return {
      success: true,
      message: `User info retrieved`,
      data: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        bot: user.bot,
        avatar: user.avatarURL(),
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to get user: ${errorMsg}` };
  }
}

async function listDiscordMembers(
  guildId: string,
  limit: number,
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
    const guild = await discordClient.guilds.fetch(guildId);
    if (!guild) {
      return { success: false, message: `Guild ${guildId} not found` };
    }

    const members = await guild.members.fetch({ limit });
    const memberList = members.map((member) => ({
      id: member.id,
      username: member.user.username,
      nickname: member.nickname,
      roles: member.roles.cache.map((r) => r.name),
      joinedAt: member.joinedAt?.toISOString(),
    }));

    return {
      success: true,
      message: `Found ${memberList.length} members`,
      data: memberList,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to list members: ${errorMsg}`,
    };
  }
}

async function sendDiscordDM(
  userId: string,
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
    const user = await discordClient.users.fetch(userId);
    if (!user) {
      return { success: false, message: `User ${userId} not found` };
    }

    await user.send(content.slice(0, 2000));
    return { success: true, message: `DM sent to ${user.username}` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to send DM: ${errorMsg}` };
  }
}

async function listDiscordGuilds(): Promise<SkillResult> {
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
    const guilds = discordClient.guilds.cache;
    const guildList = guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
    }));

    return {
      success: true,
      message: `Found ${guildList.length} guilds`,
      data: guildList,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to list guilds: ${errorMsg}`,
    };
  }
}

async function getDiscordGuildInfo(guildId: string): Promise<SkillResult> {
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
    const guild = await discordClient.guilds.fetch(guildId);
    if (!guild) {
      return { success: false, message: `Guild ${guildId} not found` };
    }

    return {
      success: true,
      message: `Guild info retrieved`,
      data: {
        id: guild.id,
        name: guild.name,
        description: guild.description,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        createdAt: guild.createdAt.toISOString(),
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to get guild info: ${errorMsg}`,
    };
  }
}

async function sendDiscordWebhook(
  webhookUrl: string,
  content: string,
  username?: string,
  avatarUrl?: string,
): Promise<SkillResult> {
  try {
    const { WebhookClient } = await import('discord.js');
    const webhook = new WebhookClient({ url: webhookUrl });

    const options: any = { content: content.slice(0, 2000) };
    if (username) options.username = username;
    if (avatarUrl) options.avatarURL = avatarUrl;

    await webhook.send(options);
    return { success: true, message: `Webhook message sent` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to send webhook: ${errorMsg}`,
    };
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

    case 'discord_edit':
      if (!data.channelId || !data.messageId || !data.content) {
        result = {
          success: false,
          message: 'Missing channelId, messageId, or content',
        };
        break;
      }
      result = await editDiscordMessage(
        data.channelId as string,
        data.messageId as string,
        data.content as string,
      );
      break;

    case 'discord_delete':
      if (!data.channelId || !data.messageId) {
        result = {
          success: false,
          message: 'Missing channelId or messageId',
        };
        break;
      }
      result = await deleteDiscordMessage(
        data.channelId as string,
        data.messageId as string,
      );
      break;

    case 'discord_pin':
      if (!data.channelId || !data.messageId) {
        result = { success: false, message: 'Missing channelId or messageId' };
        break;
      }
      result = await pinDiscordMessage(
        data.channelId as string,
        data.messageId as string,
      );
      break;

    case 'discord_unpin':
      if (!data.channelId || !data.messageId) {
        result = { success: false, message: 'Missing channelId or messageId' };
        break;
      }
      result = await unpinDiscordMessage(
        data.channelId as string,
        data.messageId as string,
      );
      break;

    case 'discord_get_messages':
      if (!data.channelId) {
        result = { success: false, message: 'Missing channelId' };
        break;
      }
      result = await getDiscordMessages(
        data.channelId as string,
        (data.limit as number) || 50,
        data.before as string | undefined,
      );
      break;

    case 'discord_create_thread':
      if (!data.channelId || !data.name) {
        result = { success: false, message: 'Missing channelId or name' };
        break;
      }
      result = await createDiscordThread(
        data.channelId as string,
        data.name as string,
        data.messageId as string | undefined,
        (data.autoArchiveDuration as number) || 1440,
      );
      break;

    case 'discord_list_channels':
      if (!data.guildId) {
        result = { success: false, message: 'Missing guildId' };
        break;
      }
      result = await listDiscordChannels(data.guildId as string);
      break;

    case 'discord_get_channel_info':
      if (!data.channelId) {
        result = { success: false, message: 'Missing channelId' };
        break;
      }
      result = await getDiscordChannelInfo(data.channelId as string);
      break;

    case 'discord_get_user':
      if (!data.userId) {
        result = { success: false, message: 'Missing userId' };
        break;
      }
      result = await getDiscordUser(data.userId as string);
      break;

    case 'discord_list_members':
      if (!data.guildId) {
        result = { success: false, message: 'Missing guildId' };
        break;
      }
      result = await listDiscordMembers(
        data.guildId as string,
        (data.limit as number) || 100,
      );
      break;

    case 'discord_dm':
      if (!data.userId || !data.content) {
        result = { success: false, message: 'Missing userId or content' };
        break;
      }
      result = await sendDiscordDM(
        data.userId as string,
        data.content as string,
      );
      break;

    case 'discord_list_guilds':
      result = await listDiscordGuilds();
      break;

    case 'discord_get_guild_info':
      if (!data.guildId) {
        result = { success: false, message: 'Missing guildId' };
        break;
      }
      result = await getDiscordGuildInfo(data.guildId as string);
      break;

    case 'discord_webhook_send':
      if (!data.webhookUrl || !data.content) {
        result = { success: false, message: 'Missing webhookUrl or content' };
        break;
      }
      result = await sendDiscordWebhook(
        data.webhookUrl as string,
        data.content as string,
        data.username as string | undefined,
        data.avatarUrl as string | undefined,
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
