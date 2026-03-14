# Squade Code

Social lobbies for Claude Code — see who's coding, squad up, and chat without leaving your editor.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Socket.io](https://img.shields.io/badge/Socket.io-realtime-010101?logo=socketdotio)

## What is it?

Squade Code is an always-on overlay app that sits on your desktop while you code. Connect your GitHub, see friends online, create or join squads (rooms), and send DMs — all synced across devices in real time.

### Features

- **GitHub OAuth login** — one-click sign-in, no accounts to create
- **Squads (rooms)** — create persistent rooms, invite friends, see who's coding what
- **Direct messages** — DMs persist across sessions and devices
- **Friend system** — add friends by GitHub username, accept requests
- **Live presence** — see who's online, what file they're working on
- **Display names** — set a custom display name visible to all users
- **Gamification** — tiers and XP based on your GitHub activity
- **Desktop overlay** — lightweight Electron window, always accessible
- **Keyboard shortcut** — `Cmd+Shift+L` to toggle the panel

## Architecture

```
src/
├── overlay/        # Electron app (main process + renderer)
│   ├── main.ts     # Electron main process, IPC handlers
│   ├── preload.ts  # Context bridge for renderer
│   └── overlay.html # Single-file UI (HTML/CSS/JS)
├── watcher.ts      # Background process — Socket.io client, state sync
├── shared/         # Shared config & auth utilities
├── mcp/            # MCP server integration
└── tui/            # Terminal UI (experimental)

server/
├── index.ts        # Express + Socket.io server
├── auth.ts         # GitHub OAuth flow
├── db.ts           # PostgreSQL connection (lazy pool)
├── middleware.ts   # JWT auth middleware
├── schema.sql      # Database schema
├── routes/         # REST API endpoints
│   ├── users.ts    # User profile & display name
│   ├── rooms.ts    # Room CRUD & membership
│   ├── messages.ts # Room & DM message persistence
│   └── friends.ts  # Friend requests & acceptance
└── socket/         # Real-time event handlers
    ├── index.ts    # Presence, connection management
    ├── rooms.ts    # Room join/leave/chat
    ├── dm.ts       # Direct message relay
    └── invites.ts  # Squad invite system
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL (for server)

### Run the overlay (dev)

```bash
pnpm install
pnpm overlay
```

This builds everything and launches the Electron overlay. On first run, click the strip and connect your GitHub account.

### Run the server (dev)

```bash
cp .env.example .env   # fill in your values
pnpm server:dev
```

Required env vars:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `JWT_SECRET` | Secret for signing auth tokens |
| `SQUADS_SERVER_URL` | Public URL of the server |

### Build the desktop app

```bash
pnpm package
```

Output goes to `release/mac-arm64/Squade Code.app`.

## Development

```bash
pnpm build          # Build everything
pnpm typecheck      # Type check
pnpm test           # Run tests
pnpm server:dev     # Server with hot reload
pnpm overlay:mock   # Overlay with mock data (no server needed)
```

## License

MIT
