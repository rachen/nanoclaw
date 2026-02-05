---
name: add-gmail
description: Add Gmail integration to NanoClaw. Can be configured as a tool (agent reads/sends emails when triggered from WhatsApp) or as a full channel (emails can trigger the agent, schedule tasks, and receive replies). Guides through GCP OAuth setup and implements the integration.
---

# Add Gmail Integration

This skill adds Gmail capabilities to NanoClaw. It can be configured in two modes:

1. **Tool Mode** - Agent can read/send emails, but only when triggered from WhatsApp
2. **Channel Mode** - Emails can trigger the agent, schedule tasks, and receive email replies

## Initial Questions

Ask the user:

> How do you want to use Gmail with NanoClaw?
>
> **Option 1: Tool Mode**
> - Agent can read and send emails when you ask it to
> - Triggered only from WhatsApp (e.g., "@Andy check my email" or "@Andy send an email to...")
> - Simpler setup, no email polling
>
> **Option 2: Channel Mode**
> - Everything in Tool Mode, plus:
> - Emails to a specific address/label trigger the agent
> - Agent replies via email (not WhatsApp)
> - Can schedule tasks via email
> - Requires email polling infrastructure

Store their choice and proceed to the appropriate section.

---

## Prerequisites (Both Modes)

### 1. Check Existing Gmail Setup

First, check if Gmail is already configured:

```bash
ls -la ~/.gmail-mcp/ 2>/dev/null || echo "No Gmail config found"
```

If `credentials.json` exists, skip to "Verify Gmail Access" below.

### 2. Create Gmail Config Directory

```bash
mkdir -p ~/.gmail-mcp
```

### 3. GCP Project Setup

**USER ACTION REQUIRED**

Tell the user:

> I need you to set up Google Cloud OAuth credentials. I'll walk you through it:
>
> 1. Open https://console.cloud.google.com in your browser
> 2. Create a new project (or select existing) - click the project dropdown at the top

Wait for user confirmation, then continue:

> 3. Now enable the Gmail API:
>    - In the left sidebar, go to **APIs & Services → Library**
>    - Search for "Gmail API"
>    - Click on it, then click **Enable**

Wait for user confirmation, then continue:

> 4. Now create OAuth credentials:
>    - Go to **APIs & Services → Credentials** (in the left sidebar)
>    - Click **+ CREATE CREDENTIALS** at the top
>    - Select **OAuth client ID**
>    - If prompted for consent screen, choose "External", fill in app name (e.g., "NanoClaw"), your email, and save
>    - For Application type, select **Desktop app**
>    - Name it anything (e.g., "NanoClaw Gmail")
>    - Click **Create**

Wait for user confirmation, then continue:

> 5. Download the credentials:
>    - Click **DOWNLOAD JSON** on the popup (or find it in the credentials list and click the download icon)
>    - Save it as `gcp-oauth.keys.json`
>
> Where did you save the file? (Give me the full path, or just paste the file contents here)

If user provides a path, copy it:

```bash
cp "/path/user/provided/gcp-oauth.keys.json" ~/.gmail-mcp/gcp-oauth.keys.json
```

If user pastes the JSON content, write it directly:

```bash
cat > ~/.gmail-mcp/gcp-oauth.keys.json << 'EOF'
{paste the JSON here}
EOF
```

Verify the file is valid JSON:

```bash
cat ~/.gmail-mcp/gcp-oauth.keys.json | head -5
```

### 4. OAuth Authorization

**USER ACTION REQUIRED**

Tell the user:

> I'm going to run the Gmail authorization. A browser window will open asking you to sign in to Google and grant access.
>
> **Important:** If you see a warning that the app isn't verified, click "Advanced" then "Go to [app name] (unsafe)" - this is normal for personal OAuth apps.

Run the authorization:

```bash
npx -y @gongrzhe/server-gmail-autoauth-mcp auth
```

If that doesn't work (some versions don't have an auth subcommand), run it and let it prompt:

```bash
timeout 60 npx -y @gongrzhe/server-gmail-autoauth-mcp || true
```

Tell user:
> Complete the authorization in your browser. The window should close automatically when done. Let me know when you've authorized.

### 5. Verify Gmail Access

Check that credentials were saved:

```bash
if [ -f ~/.gmail-mcp/credentials.json ]; then
  echo "Gmail authorization successful!"
  ls -la ~/.gmail-mcp/
else
  echo "ERROR: credentials.json not found - authorization may have failed"
fi
```

Test the connection by listing labels (quick sanity check):

```bash
echo '{"method": "tools/list"}' | timeout 10 npx -y @gongrzhe/server-gmail-autoauth-mcp 2>/dev/null | head -20 || echo "MCP responded (check output above)"
```

If everything works, proceed to implementation.

---

## Tool Mode Implementation

For Tool Mode, integrate Gmail MCP into the agent runner. Execute these changes directly.

### Step 1: Add Gmail MCP to Agent Runner

Read `container/agent-runner/src/index.ts` and find the `mcpServers` config in the `query()` call.

Add `gmail` to the `mcpServers` object:

```typescript
gmail: { command: 'npx', args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'] }
```

Find the `allowedTools` array and add Gmail tools:

```typescript
'mcp__gmail__*'
```

The result should look like:

```typescript
mcpServers: {
  nanoclaw: ipcMcp,
  gmail: { command: 'npx', args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'] }
},
allowedTools: [
  'Bash',
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  'WebSearch', 'WebFetch',
  'mcp__nanoclaw__*',
  'mcp__gmail__*'
],
```

### Step 2: Mount Gmail Credentials in Container

Read `src/container-runner.ts` and find the `buildVolumeMounts` function.

Add this mount block (after the `.claude` mount is a good location):

```typescript
// Gmail credentials directory
const gmailDir = path.join(homeDir, '.gmail-mcp');
if (fs.existsSync(gmailDir)) {
  mounts.push({
    hostPath: gmailDir,
    containerPath: '/home/node/.gmail-mcp',
    readonly: false  // MCP may need to refresh tokens
  });
}
```

### Step 3: Update Group Memory

Append to `groups/CLAUDE.md` (the global memory file):

```markdown

## Email (Gmail)

You have access to Gmail via MCP tools:
- `mcp__gmail__search_emails` - Search emails with query
- `mcp__gmail__get_email` - Get full email content by ID
- `mcp__gmail__send_email` - Send an email
- `mcp__gmail__draft_email` - Create a draft
- `mcp__gmail__list_labels` - List available labels

Example: "Check my unread emails from today" or "Send an email to john@example.com about the meeting"
```

Also append the same section to `groups/main/CLAUDE.md`.

### Step 4: Rebuild and Restart

Run these commands:

```bash
cd container && ./build.sh
```

Wait for container build to complete, then:

```bash
cd .. && npm run build
```

Wait for TypeScript compilation, then restart the service:

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Check that it started:

```bash
sleep 2 && launchctl list | grep nanoclaw
```

### Step 5: Test Gmail Integration

Tell the user:

> Gmail integration is set up! Test it by sending this message in your WhatsApp main channel:
>
> `@Andy check my recent emails`
>
> Or:
>
> `@Andy list my Gmail labels`

Watch the logs for any errors:

```bash
tail -f logs/nanoclaw.log
```

---

## Channel Mode Implementation

Channel Mode includes everything from Tool Mode, plus email polling and routing.

### Additional Questions for Channel Mode

Ask the user:

> How should the agent be triggered from email?
>
> **Option A: Specific Label**
> - Create a Gmail label (e.g., "NanoClaw")
> - Emails with this label trigger the agent
> - You manually label emails or set up Gmail filters
>
> **Option B: Email Address Pattern**
> - Emails to a specific address pattern (e.g., andy+task@gmail.com)
> - Uses Gmail's plus-addressing feature
>
> **Option C: Subject Prefix**
> - Emails with a subject starting with a keyword (e.g., "[Andy]")
> - Anyone can trigger the agent by using the prefix

Also ask:

> How should email conversations be grouped?
>
> **Option A: Per Email Thread**
> - Each email thread gets its own conversation context
> - Agent remembers the thread history
>
> **Option B: Per Sender**
> - All emails from the same sender share context
> - Agent remembers all interactions with that person
>
> **Option C: Single Context**
> - All emails share the main group context
> - Like an additional input to the main channel

Store their choices for implementation.

### Step 1: Complete Tool Mode First

Complete all Tool Mode steps above before continuing. Verify Gmail tools work by having the user test `@Andy check my recent emails`.

### Step 2: Add Email Polling Configuration

Read `src/types.ts` and add this interface:

```typescript
export interface EmailChannelConfig {
  enabled: boolean;
  triggerMode: 'label' | 'address' | 'subject';
  triggerValue: string;  // Label name, address pattern, or subject prefix
  contextMode: 'thread' | 'sender' | 'single';
  pollIntervalMs: number;
  replyPrefix?: string;  // Optional prefix for replies
}
```

Read `src/config.ts` and add this configuration (customize values based on user's earlier answers):

```typescript
export const EMAIL_CHANNEL: EmailChannelConfig = {
  enabled: true,
  triggerMode: 'label',  // or 'address' or 'subject'
  triggerValue: 'NanoClaw',  // the label name, address pattern, or prefix
  contextMode: 'thread',
  pollIntervalMs: 60000,  // Check every minute
  replyPrefix: '[Andy] '
};
```

### Step 3: Add Email State Tracking

Read `src/db.ts` and add these functions for tracking processed emails:

```typescript
// Track processed emails to avoid duplicates
export function initEmailTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_emails (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      subject TEXT,
      processed_at TEXT NOT NULL,
      response_sent INTEGER DEFAULT 0
    )
  `);
}

export function isEmailProcessed(messageId: string): boolean {
  const row = db.prepare('SELECT 1 FROM processed_emails WHERE message_id = ?').get(messageId);
  return !!row;
}

export function markEmailProcessed(messageId: string, threadId: string, sender: string, subject: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO processed_emails (message_id, thread_id, sender, subject, processed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(messageId, threadId, sender, subject, new Date().toISOString());
}

export function markEmailResponded(messageId: string): void {
  db.prepare('UPDATE processed_emails SET response_sent = 1 WHERE message_id = ?').run(messageId);
}
```

Also find the `initDatabase()` function in `src/db.ts` and add a call to `initEmailTable()`.

### Step 4: Create Email Channel Module

Copy the complete implementation from the skill directory:

```bash
cp .claude/skills/add-gmail/email-channel.ts src/email-channel.ts
```

This file provides a complete Gmail MCP client implementation with:

**Key Features:**
- **One-shot MCP subprocess pattern** - Spawns fresh process for each call (required for launchd reliability)
- **Non-standard MCP protocol** - Uses `arguments` parameter instead of standard `input` (specific to this MCP package)
- **Email polling** - Checks for new emails based on configured trigger (label/address/subject)
- **Thread-aware replies** - Sends replies with proper threading
- **Context key generation** - Routes emails to appropriate agent context

**Implementation Details:**

The module uses `child_process.spawn()` to invoke the Gmail MCP server:
1. Spawns `node` directly with absolute path (not `npx` - avoid exec issues under launchd)
2. Writes all MCP messages at once: `initialize` → `initialized` → `tools/call`
3. Closes stdin immediately to trigger server processing
4. Parses response from stdout on process close
5. 20-second timeout for safety

**MCP Protocol:**
```typescript
const messages = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {...} },
  { jsonrpc: '2.0', method: 'initialized', params: {} },
  { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: args } }
];
```

**Critical:** Uses `arguments` not `input` in tools/call (non-standard for this MCP package).

**Exported Functions:**
- `checkForNewEmails()` - Polls Gmail via search_emails and read_email tools
- `sendEmailReply()` - Sends reply via send_email tool with threading support
- `getContextKey()` - Derives group folder key from email based on context mode

See `.claude/skills/add-gmail/email-channel.ts` for full implementation (273 lines).

### Step 5: Add Email Polling to Main Loop

Read `src/index.ts` and add the email polling infrastructure. First, add these imports at the top:

```typescript
import { checkForNewEmails, sendEmailReply, getContextKey } from './email-channel.js';
import { EMAIL_CHANNEL } from './config.js';
import { isEmailProcessed, markEmailProcessed, markEmailResponded } from './db.js';

async function startEmailLoop(): Promise<void> {
  if (!EMAIL_CHANNEL.enabled) {
    logger.info('Email channel disabled');
    return;
  }

  logger.info(`Email channel running (trigger: ${EMAIL_CHANNEL.triggerMode}:${EMAIL_CHANNEL.triggerValue})`);

  while (true) {
    try {
      const emails = await checkForNewEmails();

      for (const email of emails) {
        if (isEmailProcessed(email.id)) continue;

        logger.info({ from: email.from, subject: email.subject }, 'Processing email');
        markEmailProcessed(email.id, email.threadId, email.from, email.subject);

        // Determine which group/context to use
        const contextKey = getContextKey(email);

        // Build prompt with email content
        const prompt = `<email>
<from>${email.from}</from>
<subject>${email.subject}</subject>
<body>${email.body}</body>
</email>

Respond to this email. Your response will be sent as an email reply.`;

        // Run agent with email context
        // You'll need to create a registered group for email or use a special handler
        const response = await runEmailAgent(contextKey, prompt, email);

        if (response) {
          await sendEmailReply(email.threadId, email.from, email.subject, response);
          markEmailResponded(email.id);
          logger.info({ to: email.from }, 'Email reply sent');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in email loop');
    }

    await new Promise(resolve => setTimeout(resolve, EMAIL_CHANNEL.pollIntervalMs));
  }
}

Then find the `connectWhatsApp` function and add `startEmailLoop()` call after `startMessageLoop()`:

```typescript
// In the connection === 'open' block, after startMessageLoop():
startEmailLoop();
```

### Step 6: Implement Email Agent Runner

Add this function to `src/index.ts` (or create a separate `src/email-agent.ts` if preferred):

```typescript
async function runEmailAgent(
  contextKey: string,
  prompt: string,
  email: EmailMessage
): Promise<string | null> {
  // Email uses either:
  // 1. A dedicated "email" group folder
  // 2. Or dynamic folders per thread/sender

  const groupFolder = EMAIL_CHANNEL.contextMode === 'single'
    ? 'main'  // Use main group context
    : `email/${contextKey}`;  // Isolated email context

  // Ensure folder exists
  const groupDir = path.join(GROUPS_DIR, groupFolder);
  fs.mkdirSync(groupDir, { recursive: true });

  // Create minimal registered group for email
  const emailGroup: RegisteredGroup = {
    name: contextKey,
    folder: groupFolder,
    trigger: '',  // No trigger for email
    added_at: new Date().toISOString()
  };

  // Use existing runContainerAgent
  const output = await runContainerAgent(emailGroup, {
    prompt,
    sessionId: sessions[groupFolder],
    groupFolder,
    chatJid: `email:${email.from}`,  // Use email: prefix for JID
    isMain: false,
    isScheduledTask: false
  });

  if (output.newSessionId) {
    sessions[groupFolder] = output.newSessionId;
    saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
  }

  return output.status === 'success' ? output.result : null;
}
```

### Step 7: Update IPC for Email Responses (Optional)

If you want the agent to be able to send emails proactively from within a session, read `container/agent-runner/src/ipc-mcp.ts` and add this tool:

```typescript
// Add to the MCP tools
{
  name: 'send_email_reply',
  description: 'Send an email reply in the current thread',
  inputSchema: {
    type: 'object',
    properties: {
      body: { type: 'string', description: 'Email body content' }
    },
    required: ['body']
  }
}
```

Then add handling in `src/index.ts` in the `processTaskIpc` function or create a new IPC handler for email actions.

### Step 8: Create Email Group Memory

Create the email group directory and memory file:

```bash
mkdir -p groups/email
```

Write `groups/email/CLAUDE.md`:

```markdown
# Email Channel

You are responding to emails. Your responses will be sent as email replies.

## Guidelines

- Be professional and clear
- Keep responses concise but complete
- Use proper email formatting (greetings, sign-off)
- If the email requires action you can't take, explain what the user should do

## Context

Each email thread or sender (depending on configuration) has its own conversation history.
```

### Step 9: Rebuild and Test

Rebuild the container (required since agent-runner changed):

```bash
cd container && ./build.sh
```

Wait for build to complete, then compile TypeScript:

```bash
cd .. && npm run build
```

Restart the service:

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Verify it started and check for email channel startup message:

```bash
sleep 3 && tail -20 logs/nanoclaw.log | grep -i email
```

Tell the user:

> Email channel is now active! Test it by sending an email that matches your trigger:
> - **Label mode:** Apply the "${triggerValue}" label to any email
> - **Address mode:** Send an email to ${triggerValue}
> - **Subject mode:** Send an email with subject starting with "${triggerValue}"
>
> The agent should process it within a minute and send a reply.

Monitor for the test:

```bash
tail -f logs/nanoclaw.log | grep -E "(email|Email)"
```

---

## Implementation Notes

### MCP Protocol Quirks

This Gmail MCP package (`@gongrzhe/server-gmail-autoauth-mcp`) has non-standard behavior:

**1. Uses `arguments` not `input`:**
```typescript
// Standard MCP:
{ method: 'tools/call', params: { name: 'search_emails', input: { query: '...' } } }

// This Gmail MCP:
{ method: 'tools/call', params: { name: 'search_emails', arguments: { query: '...' } } }
```

If you use `input`, you'll get a Zod error: "expected object, received undefined".

**2. Requires full handshake:**
You cannot send just a `tools/call` request. The MCP server requires:
1. `initialize` (with id)
2. `initialized` (notification, no id)
3. `tools/call` (with id)

**3. Plain-text responses:**
Unlike typical MCP servers that return structured JSON, this one returns formatted text:
```
ID: 19c2870331345630
Subject: Test email
From: user@example.com
Date: 2026-02-04
```

The `email-channel.ts` includes parsers for these formats.

### Why One-Shot Spawn Pattern?

Our implementation spawns a fresh MCP process for each Gmail operation instead of keeping a long-lived connection. Why?

**Problem with keep-alive under launchd:**
- Works perfectly in interactive terminal testing
- Hangs silently under macOS launchd on the second MCP call
- No timeout fires, no error logs, just silent hang
- Likely related to stdio pipe handling in launchd environment

**Solution:**
Each `gmailMcpCall()`:
1. Spawns fresh node process
2. Writes all messages (init + initialized + tools/call)
3. Closes stdin immediately
4. Waits for process close event
5. Parses response from stdout

This adds ~500ms latency per call but is 100% reliable under launchd.

### Email Retry Logic

The database field `response_sent` enables automatic retry:

```typescript
export function isEmailProcessed(messageId: string): boolean {
  // Only consider fully processed (response_sent = 1)
  const row = db.prepare(
    'SELECT 1 FROM processed_emails WHERE message_id = ? AND response_sent = 1'
  ).get(messageId);
  return !!row;
}
```

**Flow:**
1. Email detected → `markEmailProcessed()` (sets `response_sent = 0`)
2. Agent processes → sends reply → `markEmailResponded()` (sets `response_sent = 1`)

**If step 2 fails** (agent error, network issue, etc.), the email remains with `response_sent = 0` and will be retried on the next poll.

### OAuth Token Management

The Gmail MCP automatically refreshes expired access tokens using the refresh token stored in `~/.gmail-mcp/credentials.json`. No manual intervention needed.

Token refresh happens transparently during MCP calls when the access token has expired.

---

## Troubleshooting

### Gmail MCP not responding
```bash
# Test Gmail MCP directly
npx -y @gongrzhe/server-gmail-autoauth-mcp
```

### OAuth token expired
```bash
# Re-authorize
rm ~/.gmail-mcp/credentials.json
npx -y @gongrzhe/server-gmail-autoauth-mcp
```

### Emails not being detected
- Check the trigger configuration matches your test email
- Verify the label exists (for label mode)
- Check `processed_emails` table for already-processed emails

### Container can't access Gmail
- Verify `~/.gmail-mcp` is mounted in container
- Check container logs: `cat groups/main/logs/container-*.log | tail -50`

---

## Removing Gmail Integration

To remove Gmail entirely:

1. Remove from `container/agent-runner/src/index.ts`:
   - Delete `gmail` from `mcpServers`
   - Remove `mcp__gmail__*` from `allowedTools`

2. Remove from `src/container-runner.ts`:
   - Delete the `~/.gmail-mcp` mount block

3. Remove from `src/index.ts` (Channel Mode only):
   - Delete `startEmailLoop()` call
   - Delete email-related imports

4. Delete `src/email-channel.ts` (if created)

5. Remove Gmail sections from `groups/*/CLAUDE.md`

6. Rebuild:
   ```bash
   cd container && ./build.sh && cd ..
   npm run build
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```
