# Gmail Integration Skill

Complete Gmail integration for NanoClaw with two modes:
- **Tool Mode**: On-demand email operations via WhatsApp
- **Channel Mode**: Emails trigger agent, schedule tasks, receive replies

## Files

```
.claude/skills/add-gmail/
├── SKILL.md              # Complete integration guide (730+ lines)
├── email-channel.ts      # Production-ready implementation (273 lines)
└── README.md             # This file
```

## Implementation Status

✅ **Production Ready**

This skill includes:
- Complete step-by-step guide for both modes
- Working `email-channel.ts` with full MCP integration
- GCP OAuth setup walkthrough
- Database schema for email deduplication
- Testing and troubleshooting procedures
- Implementation notes documenting quirks and design decisions

## Quick Start

1. Run the skill: `/add-gmail`
2. Choose Tool Mode or Channel Mode
3. Follow the OAuth setup steps
4. Copy `email-channel.ts` to `src/` (for Channel Mode)
5. Test and deploy

## Key Features

### email-channel.ts

- **MCP Client**: One-shot spawn pattern for launchd reliability
- **Email Polling**: Configurable triggers (label/address/subject)
- **Context Modes**: Per-thread, per-sender, or single context
- **Thread-aware**: Sends replies with proper email threading
- **Retry Logic**: Automatic retry for failed emails
- **OAuth**: Automatic token refresh

### Technical Details

- Uses `@gongrzhe/server-gmail-autoauth-mcp` package
- Non-standard MCP protocol (`arguments` not `input`)
- Spawns fresh subprocess per operation (launchd compatibility)
- Parses plain-text MCP responses
- 20-second timeout with graceful error handling

## Dependencies

```bash
npm install @gongrzhe/server-gmail-autoauth-mcp
```

## Documentation

See [SKILL.md](./SKILL.md) for:
- GCP project setup
- OAuth credential creation
- Step-by-step implementation
- Configuration options
- MCP protocol details
- Known issues and solutions

## Comparison to Discord Skill

Both skills are now production-ready:
- **Discord**: 1708 lines + complete TypeScript implementation
- **Gmail**: 730 lines + complete TypeScript implementation

Both follow the same pattern: comprehensive documentation + working code.
