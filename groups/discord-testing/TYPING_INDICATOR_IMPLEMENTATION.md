# Typing Indicator Implementation

## Overview
This document describes the typing indicator feature implementation for NanoClaw's Discord integration.

## Container-Side (Completed ✅)

### Changes Made
- **File**: `/app/src/ipc-mcp.ts`
- **Tool Added**: `send_typing_indicator`

### Tool Specification
```typescript
tool(
  'send_typing_indicator',
  'Send a typing indicator to the current chat (Discord/WhatsApp). Shows the "... is typing" status to users.',
  {
    duration: z.number().optional().describe('How long to show typing in milliseconds (default: 5000, max: 15000)')
  },
  async (args) => {
    const duration = Math.min(args.duration || 5000, 15000); // Cap at 15 seconds

    const data = {
      type: 'typing_indicator',
      chatJid,
      groupFolder,
      duration,
      timestamp: new Date().toISOString()
    };

    const filename = writeIpcFile(MESSAGES_DIR, data);

    return {
      content: [{
        type: 'text',
        text: `Typing indicator sent (${filename}) for ${duration}ms`
      }]
    };
  }
)
```

### IPC Message Format
When the tool is called, it writes a JSON file to `/workspace/ipc/messages/` with the following structure:

```json
{
  "type": "typing_indicator",
  "chatJid": "1234567890@g.us",
  "groupFolder": "discord-testing",
  "duration": 5000,
  "timestamp": "2026-02-04T21:48:00.000Z"
}
```

## Host-Side (TODO ⚠️)

The host process needs to be modified to:

1. **Watch for IPC messages** with `type: 'typing_indicator'`
2. **Call Discord API** to trigger typing indicator
3. **Handle Discord-specific logic**

### Required Implementation

#### Discord.js Integration
```typescript
// Pseudo-code for host-side handler
async function handleTypingIndicator(message: IpcMessage) {
  const { chatJid, duration } = message;

  // Get Discord channel from chatJid mapping
  const channel = getChannelFromJid(chatJid);

  if (!channel || !channel.isTextBased()) {
    console.warn('Invalid channel for typing indicator');
    return;
  }

  // Send typing indicator
  await channel.sendTyping();

  // Discord typing indicators last 10 seconds by default
  // If duration > 10000, refresh the indicator
  if (duration > 10000) {
    const refreshCount = Math.ceil(duration / 9000); // Refresh every 9s for safety
    for (let i = 1; i < refreshCount; i++) {
      await new Promise(resolve => setTimeout(resolve, 9000));
      await channel.sendTyping();
    }
  }
}
```

#### WhatsApp Integration (if needed)
```typescript
// Pseudo-code for WhatsApp
async function handleTypingIndicatorWhatsApp(message: IpcMessage) {
  const { chatJid, duration } = message;

  // Use @whiskeysockets/baileys or similar
  await sock.sendPresenceUpdate('composing', chatJid);

  // Reset after duration
  setTimeout(async () => {
    await sock.sendPresenceUpdate('paused', chatJid);
  }, duration);
}
```

### Host Process Location
The host process is likely:
- Running outside the container
- Handling Discord/WhatsApp connections
- Already watching `/workspace/ipc/messages/` for message types
- Needs to add a case for `type: 'typing_indicator'`

### Testing After Host Implementation
Once the host-side is implemented, test by:
1. Sending a message in Discord that triggers the agent
2. The agent should automatically call `send_typing_indicator` when processing
3. Users should see "Orli is typing..." in Discord

## Automatic Usage (Optional Enhancement)

To make the agent automatically show typing when processing messages, you could:

1. **Auto-trigger on message receive**: Have the host send typing immediately when spawning a container
2. **Agent-side automation**: Add to agent prompt that it should call typing indicator at start of processing
3. **SDK hook**: Use a pre-processing hook to automatically call the tool

## Files Modified
- `/app/src/ipc-mcp.ts` - Added send_typing_indicator tool
- `/app/dist/ipc-mcp.js` - Compiled output (auto-generated)

## Next Steps
1. ✅ Container-side tool implemented and compiled
2. ⚠️ Host process needs to handle 'typing_indicator' IPC messages
3. ⚠️ Add Discord API calls to trigger typing
4. ⚠️ Test end-to-end functionality
5. 🔄 Optional: Add automatic triggering on message receive

## Notes
- Typing indicators are capped at 15 seconds to prevent abuse
- Discord's native typing indicator lasts ~10 seconds and needs refreshing for longer durations
- The agent can now call this tool proactively during long operations
