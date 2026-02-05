import { Client, GatewayIntentBits } from 'discord.js';

import { logger } from './logger.js';

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

export function getDiscordClient(): Client | null {
  return discordClient;
}

export function isDiscordReady(): boolean {
  return clientReady;
}
