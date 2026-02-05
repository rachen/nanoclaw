/**
 * Discord Integration - MCP Tool Definitions (Agent/Container Side)
 *
 * These tools run inside the container and communicate with the host via IPC.
 * The host-side implementation is in host.ts.
 *
 * Note: This file is compiled in the container, not on the host.
 * The @ts-ignore is needed because the SDK is only available in the container.
 */

import fs from 'node:fs';
import path from 'node:path';

// @ts-ignore - SDK available in container environment only
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// IPC directories (inside container)
const IPC_DIR = '/workspace/ipc';
const TASKS_DIR = path.join(IPC_DIR, 'tasks');
const RESULTS_DIR = path.join(IPC_DIR, 'discord_results');

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  return filename;
}

async function waitForResult(
  requestId: string,
  maxWait = 30000,
): Promise<{ success: boolean; message: string }> {
  const resultFile = path.join(RESULTS_DIR, `${requestId}.json`);
  const pollInterval = 500;
  let elapsed = 0;

  while (elapsed < maxWait) {
    if (fs.existsSync(resultFile)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
        fs.unlinkSync(resultFile);
        return result;
      } catch (err) {
        return { success: false, message: `Failed to read result: ${err}` };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  return { success: false, message: 'Request timed out' };
}

export interface SkillToolsContext {
  groupFolder: string;
  isMain: boolean;
  isScheduledTask?: boolean;
}

/**
 * Create Discord integration MCP tools
 */
export function createDiscordTools(ctx: SkillToolsContext) {
  const { groupFolder, isMain, isScheduledTask } = ctx;

  return [
    tool(
      'discord_send',
      `Send a message to a Discord channel.

This tool sends messages to Discord channels via the bot.
For scheduled tasks: Can send to any configured channel.
For interactive use: Only main group can send messages.

The channel_id is the Discord channel snowflake ID (numeric string).
Messages over 2000 characters will be split automatically.`,
      {
        channel_id: z
          .string()
          .describe(
            'Discord channel ID (snowflake, e.g., "1234567890123456789")',
          ),
        content: z
          .string()
          .max(4000)
          .describe(
            'Message content to send (max 4000 chars, will be split if > 2000)',
          ),
      },
      async (args: { channel_id: string; content: string }) => {
        if (!isScheduledTask && !isMain) {
          return {
            content: [
              {
                type: 'text',
                text: 'Only the main group can send Discord messages interactively. Scheduled tasks can send to any channel.',
              },
            ],
            isError: true,
          };
        }

        if (!args.channel_id.match(/^\d+$/)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid channel_id. Must be a Discord snowflake ID (numeric string).',
              },
            ],
            isError: true,
          };
        }

        const requestId = `discord-send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(TASKS_DIR, {
          type: 'discord_send',
          requestId,
          channelId: args.channel_id,
          content: args.content,
          groupFolder,
          timestamp: new Date().toISOString(),
        });

        const result = await waitForResult(requestId);
        return {
          content: [{ type: 'text', text: result.message }],
          isError: !result.success,
        };
      },
    ),

    tool(
      'discord_reply',
      `Reply to a specific Discord message.

This tool sends a reply to an existing Discord message, creating a thread reply.
For scheduled tasks: Can reply in any configured channel.
For interactive use: Only main group can send replies.`,
      {
        channel_id: z
          .string()
          .describe('Discord channel ID where the message is'),
        message_id: z
          .string()
          .describe('Discord message ID to reply to (snowflake)'),
        content: z
          .string()
          .max(4000)
          .describe('Reply content (max 4000 chars)'),
      },
      async (args: {
        channel_id: string;
        message_id: string;
        content: string;
      }) => {
        if (!isScheduledTask && !isMain) {
          return {
            content: [
              {
                type: 'text',
                text: 'Only the main group can send Discord replies interactively.',
              },
            ],
            isError: true,
          };
        }

        if (
          !args.channel_id.match(/^\d+$/) ||
          !args.message_id.match(/^\d+$/)
        ) {
          return {
            content: [
              {
                type: 'text',
                text: 'Invalid channel_id or message_id. Must be Discord snowflake IDs.',
              },
            ],
            isError: true,
          };
        }

        const requestId = `discord-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(TASKS_DIR, {
          type: 'discord_reply',
          requestId,
          channelId: args.channel_id,
          messageId: args.message_id,
          content: args.content,
          groupFolder,
          timestamp: new Date().toISOString(),
        });

        const result = await waitForResult(requestId);
        return {
          content: [{ type: 'text', text: result.message }],
          isError: !result.success,
        };
      },
    ),

    tool(
      'discord_react',
      `Add a reaction to a Discord message.

Adds an emoji reaction to an existing message.
For scheduled tasks: Can react in any configured channel.
For interactive use: Only main group can add reactions.`,
      {
        channel_id: z
          .string()
          .describe('Discord channel ID where the message is'),
        message_id: z.string().describe('Discord message ID to react to'),
        emoji: z
          .string()
          .describe(
            'Emoji to react with (Unicode emoji like "👍" or custom emoji format "<:name:id>")',
          ),
      },
      async (args: {
        channel_id: string;
        message_id: string;
        emoji: string;
      }) => {
        if (!isScheduledTask && !isMain) {
          return {
            content: [
              {
                type: 'text',
                text: 'Only the main group can add Discord reactions interactively.',
              },
            ],
            isError: true,
          };
        }

        const requestId = `discord-react-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(TASKS_DIR, {
          type: 'discord_react',
          requestId,
          channelId: args.channel_id,
          messageId: args.message_id,
          emoji: args.emoji,
          groupFolder,
          timestamp: new Date().toISOString(),
        });

        const result = await waitForResult(requestId);
        return {
          content: [{ type: 'text', text: result.message }],
          isError: !result.success,
        };
      },
    ),
  ];
}
