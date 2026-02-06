# Request Host Changes Skill

## Overview

Enables container agents to request host-level modifications (code changes, npm installs, service restarts) by writing structured plans that the host can review and apply.

## Philosophy

**NanoClaw containers are sandboxed by design.** They can read/write files in their group folders and use MCP tools, but they cannot:
- Modify host TypeScript code (`src/*.ts`)
- Install npm packages
- Rebuild or restart services
- Execute commands on the host OS

This skill establishes a **file-based handoff pattern** where containers write structured modification requests, and the host (via Claude Code or manual review) applies them.

## When to Use This Skill

Use this when you want containers to be able to:
- Design new features that require host code changes
- Request npm package installations
- Suggest improvements to the core system
- Document implementation plans for user review

**Do NOT use this if:**
- Containers only need to write to their own group folders (they can already do that)
- Changes are purely within container scope (MCP tools, group CLAUDE.md, etc.)

## What This Skill Does

1. Updates group CLAUDE.md files to document the handoff pattern
2. Provides a template for PENDING_HOST_CHANGES.md
3. Creates example documentation
4. No code changes required - pure documentation pattern

## Architecture

### Container Perspective

**Available paths:**
- `/workspace/group/` → `groups/{group_folder}/` (read-write)
- `/workspace/project/` → project root (main group only, read-write)
- `/workspace/global/` → `groups/global/` (read-only)

**To request host changes:**
```bash
# Write structured plan to:
/workspace/group/PENDING_HOST_CHANGES.md
```

**Template structure:**
```markdown
# Host Modification Request

## Summary
[One sentence: what and why]

## Context
[Background and problem]

## Changes Required

### 1. [Change Type]
**Files affected:** `file1.ts`, `file2.ts`
**What to do:** [Detailed instructions]

### 2. [Next change...]

## Testing
[How to verify]

## Rollback
[How to undo]
```

### Host Perspective

**Workflow:**
1. Container writes `groups/{group}/PENDING_HOST_CHANGES.md`
2. User reviews the plan
3. User applies with: `claude "Apply changes in groups/{group}/PENDING_HOST_CHANGES.md"`
4. Claude Code on host executes the plan

**Automated scanning + approval workflow:**
1. Container writes `groups/{group}/PENDING_HOST_CHANGES.md`
2. Host scanner detects the file within 60 seconds
3. Approval request sent via Discord buttons or WhatsApp text
4. User approves or denies
5. On approval: Claude CLI applies the plan automatically
6. File archived as `HOST_CHANGES_APPLIED_*.md` or `HOST_CHANGES_DENIED_*.md`

## Installation

This skill only updates documentation, no code changes:

### Step 1: Update Main Group CLAUDE.md

Add this section after "Container Mounts":

```markdown
---

## Requesting Host Modifications

When you need to modify the **host system** (not just files in the project), write a detailed plan to `PENDING_HOST_CHANGES.md` in this folder.

**Use this for:**
- Modifying TypeScript source code in `src/*.ts`
- Installing npm packages
- Updating `package.json` or `tsconfig.json`
- Changing container configuration
- Rebuilding container images
- Restarting the launchd service

**Template:**

\`\`\`markdown
# Host Modification Request

## Summary
[One sentence: what needs to be done and why]

## Context
[Why this change is needed, what problem it solves]

## Changes Required

### 1. [Change Type - e.g., "Add new IPC handler"]
**Files affected:** `src/index.ts`, `src/types.ts`

**What to do:**
[Detailed instructions with code snippets if applicable]

### 2. [Next change...]
...

## Testing
[How to verify the changes work]

## Rollback
[How to undo if something goes wrong]
\`\`\`

After writing the plan, tell the user: "I've written a host modification request to `PENDING_HOST_CHANGES.md`. Please review and apply it by running: `claude \"Apply changes in groups/main/PENDING_HOST_CHANGES.md\"`"

**Important:** You can read/write files in `/workspace/project/` but those changes happen in the container. The host process won't see them until restarted. For code changes, always use this handoff pattern.

---
```

### Step 2: Create Example Template

Create `groups/main/PENDING_HOST_CHANGES.example.md`:

```markdown
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
\`\`\`bash
npm install node-telegram-bot-api
npm install --save-dev @types/node-telegram-bot-api
\`\`\`

### 2. Add Telegram Configuration
**Files affected:** `src/config.ts`

**What to do:**
Add new environment variable:
\`\`\`typescript
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
\`\`\`

### 3. Add Telegram Bot Initialization
**Files affected:** `src/index.ts`

**What to do:**
[... code snippets ...]

## Testing
1. Restart service
2. Send test message to bot
3. Verify response
4. Check logs

## Rollback
1. Revert changes
2. Uninstall packages
3. Rebuild and restart
```

### Step 3: Update Other Group CLAUDE.md Files (Optional)

For non-main groups (discord-testing, discord-dm-*, etc.), they can only write to `/workspace/group/`. Add similar instructions:

```markdown
## Requesting Host Modifications

If you need host-level changes, write a plan to:
`/workspace/group/PENDING_HOST_CHANGES.md`

Use the same template format documented in the main group's CLAUDE.md.
```

## Real-World Example

See `groups/discord-dm-93979054763413504/PENDING_HOST_CHANGES.md` for the TikTok auto-embed feature request that validated this workflow.

**What happened:**
1. User asked container via Discord DM to design TikTok auto-embed feature
2. Container created implementation plan and wrote files to `/workspace/group/`
3. Container documented everything in PENDING_HOST_CHANGES.md
4. Host (Claude Code) read the plan and applied changes:
   - Copied handler to `src/handlers/tiktokHandler.js`
   - Installed `@tobyg74/tiktok-api-dl`
   - Integrated into `src/index.ts`
   - Rebuilt and restarted service
5. Feature tested and working (later disabled for different reasons)

## Benefits

**Security:**
- Containers remain sandboxed
- All host changes require explicit user approval
- No automatic code execution from containers

**Flexibility:**
- Containers can design features beyond their permissions
- Users can review before applying
- Clear handoff documentation

**Simplicity:**
- File-based trigger, integrates with existing scheduler
- Discord buttons for one-click approval
- WhatsApp text-based approval as fallback

## Automated Scanner

The host runs a scanner every 60 seconds (in the scheduler loop) that:
1. Scans `groups/*/PENDING_HOST_CHANGES.md` for new files
2. Parses the `## Summary` section
3. Sends approval request to the group's chat (Discord buttons or WhatsApp text)
4. Renames file to `.notified.md` to avoid re-notifying

**Approval flow:**
- **Discord:** Click Approve/Deny buttons on the message
- **WhatsApp:** Reply `approve hc-{id}` or `deny hc-{id}`

**On approval:** Runs `claude --print` to apply the plan, archives to `HOST_CHANGES_APPLIED_*.md`
**On denial:** Archives to `HOST_CHANGES_DENIED_*.md`

## Implementation Files

| File | Purpose |
|------|---------|
| `src/host-changes-scanner.ts` | Scan logic, approval handling, Discord button handler |
| `src/types.ts` | `HostModificationRequest` interface |
| `src/task-scheduler.ts` | Calls `scanForHostChanges` each cycle |
| `src/index.ts` | Wires approval interception + Discord interaction handler |

## Testing

1. Create `groups/main/PENDING_HOST_CHANGES.md` with a `## Summary` section
2. Start or restart the service
3. Wait up to 60s for scanner to detect the file
4. Approve via Discord button or WhatsApp text reply
5. Verify Claude CLI runs and file is archived

## Cost

Scanning is free. Applying approved changes costs one Claude API call per approval.

## License

MIT
