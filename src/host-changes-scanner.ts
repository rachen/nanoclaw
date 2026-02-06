import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
} from 'discord.js';

import { GROUPS_DIR } from './config.js';
import { logger } from './logger.js';
import { HostModificationRequest, RegisteredGroup } from './types.js';

export interface HostChangesDependencies {
  sendMessage: (jid: string, text: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  discordClient: () => Client | null;
}

const pendingRequests = new Map<string, HostModificationRequest>();

function parseSummary(content: string): string {
  const match = content.match(/## Summary\s*\n([\s\S]*?)(?=\n## |\n---|\n$)/);
  if (match) {
    return match[1].trim().slice(0, 200);
  }
  // Fallback: first non-heading line
  const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  return lines[0]?.trim().slice(0, 200) || 'No summary provided';
}

function findChatJid(
  groupFolder: string,
  registeredGroups: Record<string, RegisteredGroup>,
): string | null {
  for (const [jid, group] of Object.entries(registeredGroups)) {
    if (group.folder === groupFolder) return jid;
  }
  return null;
}

export async function scanForHostChanges(
  deps: HostChangesDependencies,
): Promise<void> {
  let groupFolders: string[];
  try {
    groupFolders = fs.readdirSync(GROUPS_DIR).filter((f) => {
      try {
        return fs.statSync(path.join(GROUPS_DIR, f)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return;
  }

  const groups = deps.registeredGroups();

  for (const folder of groupFolders) {
    const pendingFile = path.join(GROUPS_DIR, folder, 'PENDING_HOST_CHANGES.md');
    if (!fs.existsSync(pendingFile)) continue;

    // Check if already tracked
    const alreadyTracked = Array.from(pendingRequests.values()).some(
      (r) => r.groupFolder === folder && r.status === 'pending',
    );
    if (alreadyTracked) continue;

    const chatJid = findChatJid(folder, groups);
    if (!chatJid) {
      logger.warn({ folder }, 'Host changes file found but no registered group');
      continue;
    }

    const content = fs.readFileSync(pendingFile, 'utf-8');
    const summary = parseSummary(content);
    const id = `hc-${Date.now()}`;
    const request: HostModificationRequest = {
      id,
      groupFolder: folder,
      chatJid,
      summary,
      filePath: pendingFile,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    pendingRequests.set(id, request);
    logger.info({ id, folder, summary }, 'New host changes request found');

    // Send approval request
    if (chatJid.startsWith('discord:')) {
      const discord = deps.discordClient();
      if (discord) {
        try {
          const channelId = chatJid.replace('discord:', '');
          const channel = await discord.channels.fetch(channelId).catch(() => null);
          // If it's a user DM, resolve via user
          const target = channel && channel.isTextBased()
            ? channel
            : await (async () => {
                const user = await discord.users.fetch(channelId);
                return user.createDM();
              })();

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`hc_approve_${id}`)
              .setLabel('Approve')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`hc_deny_${id}`)
              .setLabel('Deny')
              .setStyle(ButtonStyle.Danger),
          );

          await (target as any).send({
            content:
              `**Host Changes Request** (\`${id}\`)\n` +
              `**Group:** ${folder}\n` +
              `**Summary:** ${summary}\n\n` +
              `Review the full plan at \`groups/${folder}/PENDING_HOST_CHANGES.md\``,
            components: [row],
          });
        } catch (err) {
          logger.error({ id, err }, 'Failed to send Discord approval request');
          // Fall back to text
          await deps.sendMessage(
            chatJid,
            `**Host Changes Request**\n` +
              `**Group:** ${folder}\n` +
              `**Summary:** ${summary}\n\n` +
              `Reply \`approve\` or \`deny\``,
          );
        }
      }
    } else {
      await deps.sendMessage(
        chatJid,
        `Host Changes Request\n` +
          `Group: ${folder}\n` +
          `Summary: ${summary}\n\n` +
          `Reply "approve" or "deny"`,
      );
    }

    // Rename to .notified so we don't re-notify
    const notifiedFile = pendingFile.replace('.md', '.notified.md');
    fs.renameSync(pendingFile, notifiedFile);
    request.filePath = notifiedFile;
  }
}

/**
 * Check if a message is an approval/denial for a host changes request.
 * Accepts bare "approve" / "deny" (resolves by chatJid) or "approve hc-123" with explicit ID.
 */
export function checkApprovalMessage(
  content: string,
  chatJid: string,
): { isApproval: boolean; requestId: string; approved: boolean } {
  const match = content.match(/^(approve|deny)(?:\s+(hc-\d+))?\s*$/i);
  if (!match) {
    return { isApproval: false, requestId: '', approved: false };
  }

  const approved = match[1].toLowerCase() === 'approve';

  // If an explicit ID was given, use it
  if (match[2]) {
    return { isApproval: true, requestId: match[2], approved };
  }

  // Otherwise find the most recent pending request for this chat
  let latest: HostModificationRequest | null = null;
  for (const req of pendingRequests.values()) {
    if (req.chatJid === chatJid && req.status === 'pending') {
      if (!latest || req.timestamp > latest.timestamp) {
        latest = req;
      }
    }
  }

  if (!latest) {
    return { isApproval: false, requestId: '', approved: false };
  }

  return { isApproval: true, requestId: latest.id, approved };
}

export async function handleApproval(
  requestId: string,
  approved: boolean,
  approvedBy: string,
  sendMessage: (jid: string, text: string) => Promise<void>,
): Promise<void> {
  const request = pendingRequests.get(requestId);
  if (!request) {
    logger.warn({ requestId }, 'Unknown host changes request');
    return;
  }
  if (request.status !== 'pending') {
    logger.warn({ requestId, status: request.status }, 'Request already processed');
    return;
  }

  request.approvedBy = approvedBy;

  if (!approved) {
    request.status = 'denied';
    const deniedPath = path.join(
      GROUPS_DIR,
      request.groupFolder,
      `HOST_CHANGES_DENIED_${Date.now()}.md`,
    );
    try {
      fs.renameSync(request.filePath, deniedPath);
    } catch {
      // File may already be moved
    }
    await sendMessage(request.chatJid, `Host changes request \`${requestId}\` denied.`);
    logger.info({ requestId, approvedBy }, 'Host changes denied');
    return;
  }

  request.status = 'approved';
  await sendMessage(
    request.chatJid,
    `Host changes request \`${requestId}\` approved. Applying...`,
  );

  try {
    const planContent = fs.readFileSync(request.filePath, 'utf-8');
    // Run claude CLI to apply the changes
    const result = execSync(
      `claude --print "Apply the following host modification plan. Read the relevant source files first, then make the changes described. After applying, run npm run build to verify.\n\n${planContent.replace(/"/g, '\\"')}"`,
      {
        cwd: path.resolve(GROUPS_DIR, '..'),
        timeout: 300000, // 5 minutes
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    request.status = 'applied';
    const appliedPath = path.join(
      GROUPS_DIR,
      request.groupFolder,
      `HOST_CHANGES_APPLIED_${Date.now()}.md`,
    );
    fs.renameSync(request.filePath, appliedPath);

    const summary = result.slice(0, 500);
    await sendMessage(
      request.chatJid,
      `Host changes \`${requestId}\` applied successfully.\n\n${summary}`,
    );
    logger.info({ requestId, approvedBy }, 'Host changes applied');
  } catch (err) {
    request.status = 'failed';
    request.error = err instanceof Error ? err.message : String(err);
    await sendMessage(
      request.chatJid,
      `Host changes \`${requestId}\` failed to apply: ${request.error.slice(0, 300)}`,
    );
    logger.error({ requestId, err }, 'Failed to apply host changes');
  }
}

export async function handleDiscordButtonInteraction(
  interaction: any,
  sendMessage: (jid: string, text: string) => Promise<void>,
): Promise<void> {
  const customId = interaction.customId as string;
  if (!customId.startsWith('hc_approve_') && !customId.startsWith('hc_deny_')) {
    return;
  }

  const approved = customId.startsWith('hc_approve_');
  const requestId = customId.replace(/^hc_(approve|deny)_/, '');

  const request = pendingRequests.get(requestId);
  if (!request) {
    await interaction.reply({ content: 'Unknown or expired request.', ephemeral: true });
    return;
  }
  if (request.status !== 'pending') {
    await interaction.reply({
      content: `Request already ${request.status}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.update({
    content:
      interaction.message.content +
      `\n\n${approved ? 'Approved' : 'Denied'} by ${interaction.user.username}`,
    components: [],
  });

  await handleApproval(requestId, approved, interaction.user.username, sendMessage);
}
