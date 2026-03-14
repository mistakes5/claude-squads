// Load .env before anything else
try {
  // @ts-ignore — dotenv is optional
  const { config } = await import("dotenv");
  config({ path: new URL("../../.env", import.meta.url).pathname });
} catch {}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { login, logout } from "../shared/auth.js";
import { loadToken } from "../shared/config.js";
import { createRoom, joinRoom, leaveRoom, listRooms, myRooms } from "./tools/rooms.js";
import { trackPresence, updateStatus, getPresence, untrackPresence } from "./tools/presence.js";
import { sendMessage, getMessages } from "./tools/chat.js";
import { postActivity, getActivityHistory } from "./tools/activity.js";
import { addFriend, acceptFriend, listFriends } from "./tools/friends.js";
import { shareSession, unshareSession, listSessions } from "./tools/sessions.js";
import { pingUser, getPendingPings } from "./tools/ping.js";
import { sendEmote, listEmotes } from "./tools/emotes.js";

const server = new Server(
  { name: "squads", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ───────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "squads_login",
      description: "Log in with your GitHub account. Opens a browser for OAuth.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "squads_logout",
      description: "Log out and clear your stored session.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "squads_whoami",
      description: "Show your current Squads identity.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "squads_create_room",
      description: "Create a new squad room/lobby.",
      inputSchema: {
        type: "object" as const,
        properties: { name: { type: "string", description: "Room name" } },
        required: ["name"],
      },
    },
    {
      name: "squads_join_room",
      description: "Join a squad room by its slug.",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "Room slug" } },
        required: ["slug"],
      },
    },
    {
      name: "squads_leave_room",
      description: "Leave a squad room.",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "Room slug" } },
        required: ["slug"],
      },
    },
    {
      name: "squads_list_rooms",
      description: "List public squad rooms.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "squads_my_rooms",
      description: "List rooms you've joined.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "squads_who_is_here",
      description: "See who's online in a room right now.",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "Room slug" } },
        required: ["slug"],
      },
    },
    {
      name: "squads_set_status",
      description: 'Set your status in a room (e.g. "vibing", "in the zone", "debugging").',
      inputSchema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Room slug" },
          status: { type: "string", description: "Your status message" },
          current_file: { type: "string", description: "File you're working on (optional)" },
        },
        required: ["slug", "status"],
      },
    },
    {
      name: "squads_send_message",
      description: "Send a chat message to a room.",
      inputSchema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Room slug" },
          message: { type: "string", description: "Message content" },
        },
        required: ["slug", "message"],
      },
    },
    {
      name: "squads_get_messages",
      description: "Get recent chat messages from a room.",
      inputSchema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Room slug" },
          limit: { type: "number", description: "Number of messages (default 20)" },
        },
        required: ["slug"],
      },
    },
    {
      name: "squads_post_activity",
      description: "Broadcast what you're doing to your squad.",
      inputSchema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Room slug" },
          action: { type: "string", description: 'What you\'re doing (e.g. "editing", "debugging")' },
          detail: { type: "string", description: "Details (e.g. file name)" },
        },
        required: ["slug", "action"],
      },
    },
    {
      name: "squads_get_activity",
      description: "Get recent activity history from a room.",
      inputSchema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Room slug" },
          limit: { type: "number", description: "Number of activities (default 20)" },
        },
        required: ["slug"],
      },
    },
    {
      name: "squads_add_friend",
      description: "Send a friend request by GitHub username.",
      inputSchema: {
        type: "object" as const,
        properties: {
          username: { type: "string", description: "GitHub username" },
        },
        required: ["username"],
      },
    },
    {
      name: "squads_accept_friend",
      description: "Accept a pending friend request.",
      inputSchema: {
        type: "object" as const,
        properties: {
          username: { type: "string", description: "GitHub username of requester" },
        },
        required: ["username"],
      },
    },
    {
      name: "squads_friends",
      description: "List your friends and their status.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "squads_share_session",
      description: "Share your Claude Code session with your squad (spectator mode).",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "Room slug" } },
        required: ["slug"],
      },
    },
    {
      name: "squads_unshare_session",
      description: "Stop sharing your session.",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "Room slug" } },
        required: ["slug"],
      },
    },
    {
      name: "squads_list_sessions",
      description: "See active shared sessions in a room.",
      inputSchema: {
        type: "object" as const,
        properties: { slug: { type: "string", description: "Room slug" } },
        required: ["slug"],
      },
    },
    {
      name: "squads_ping",
      description: "Ping/nudge someone to get them on Claude Code. Sends a notification even if they're offline.",
      inputSchema: {
        type: "object" as const,
        properties: {
          username: { type: "string", description: "GitHub username to ping" },
          message: { type: "string", description: "Optional custom message (default: 'wants you on Claude Code!')" },
          slug: { type: "string", description: "Room slug to ping in (optional — pings all shared rooms if omitted)" },
        },
        required: ["username"],
      },
    },
    {
      name: "squads_pings",
      description: "Check your pending pings/nudges.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "squads_emote",
      description: "Send an animated emote to your squad room (Clash Royale style). e.g. clawd-wave, clawd-ship, clawd-vibe, clawd-fire, clawd-lgtm, gg, ship, rip",
      inputSchema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Room slug" },
          emote: { type: "string", description: "Emote name (e.g. clawd-wave, clawd-ship, gg)" },
        },
        required: ["slug", "emote"],
      },
    },
    {
      name: "squads_emotes",
      description: "List all available animated emotes.",
      inputSchema: { type: "object" as const, properties: {} },
    },
  ],
}));

// ─── Tool handler ───────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "squads_login": {
        const user = await login();
        return text(`Logged in as ${user.github_username}!`);
      }

      case "squads_logout": {
        logout();
        return text("Logged out.");
      }

      case "squads_whoami": {
        const token = loadToken();
        if (!token) return text("Not logged in. Use squads_login first.");
        return text(`You are ${token.user.github_username}`);
      }

      case "squads_create_room": {
        const room = await createRoom(args!.name as string);
        return text(`Created room "${room.name}" (slug: ${room.slug}). You've been auto-joined!`);
      }

      case "squads_join_room": {
        const room = await joinRoom(args!.slug as string);
        await trackPresence(args!.slug as string);
        // Update settings so watcher + status line know the current room
        const { saveSettings, loadSettings } = await import("../shared/config.js");
        const settings = loadSettings();
        settings.current_room = args!.slug as string;
        saveSettings(settings);
        return text(`Joined "${room.name}"! You're now visible to the squad.`);
      }

      case "squads_leave_room": {
        const slug = args!.slug as string;
        await untrackPresence(slug);
        await leaveRoom(slug);
        return text(`Left the room.`);
      }

      case "squads_list_rooms": {
        const rooms = await listRooms();
        if (rooms.length === 0) return text("No public rooms yet. Create one!");
        const lines = rooms.map(
          (r) => `  ${r.name} (/${r.slug}) — ${r.member_count} members`
        );
        return text(`Public rooms:\n${lines.join("\n")}`);
      }

      case "squads_my_rooms": {
        const rooms = await myRooms();
        if (rooms.length === 0) return text("You haven't joined any rooms yet.");
        const lines = rooms.map((r) => `  ${r.name} (/${r.slug})`);
        return text(`Your rooms:\n${lines.join("\n")}`);
      }

      case "squads_who_is_here": {
        const members = getPresence(args!.slug as string);
        if (members.length === 0) return text("Nobody's here right now.");
        const lines = members.map(
          (m) =>
            `  ${m.github_username} — ${m.status}${m.current_file ? ` (${m.current_file})` : ""}`
        );
        return text(`Online in this room:\n${lines.join("\n")}`);
      }

      case "squads_set_status": {
        await updateStatus(
          args!.slug as string,
          args!.status as string,
          args!.current_file as string | undefined
        );
        return text(`Status updated: ${args!.status}`);
      }

      case "squads_send_message": {
        const msg = await sendMessage(
          args!.slug as string,
          args!.message as string
        );
        return text(`Message sent!`);
      }

      case "squads_get_messages": {
        const messages = await getMessages(
          args!.slug as string,
          (args!.limit as number) ?? 20
        );
        if (messages.length === 0) return text("No messages yet.");
        const lines = messages.map(
          (m) =>
            `  [${new Date(m.created_at).toLocaleTimeString()}] ${(m.users as any)?.github_username ?? "?"}: ${m.content}`
        );
        return text(lines.join("\n"));
      }

      case "squads_post_activity": {
        await postActivity(
          args!.slug as string,
          args!.action as string,
          args!.detail as string | undefined
        );
        return text("Activity broadcasted to your squad.");
      }

      case "squads_get_activity": {
        const activities = await getActivityHistory(
          args!.slug as string,
          (args!.limit as number) ?? 20
        );
        if (activities.length === 0) return text("No activity yet.");
        const lines = activities.map(
          (a) =>
            `  ${(a.users as any)?.github_username ?? "?"} ${a.action}${a.detail ? ` ${a.detail}` : ""}`
        );
        return text(lines.join("\n"));
      }

      case "squads_add_friend": {
        await addFriend(args!.username as string);
        return text(`Friend request sent to ${args!.username}!`);
      }

      case "squads_accept_friend": {
        await acceptFriend(args!.username as string);
        return text(`You and ${args!.username} are now friends!`);
      }

      case "squads_friends": {
        const friends = await listFriends();
        if (friends.length === 0)
          return text("No friends yet. Add someone with squads_add_friend!");
        const lines = friends.map((f) => {
          const badge = f.status === "pending" ? (f.direction === "received" ? " (pending — accept?)" : " (pending)") : "";
          return `  ${f.user.github_username}${badge}`;
        });
        return text(`Friends:\n${lines.join("\n")}`);
      }

      case "squads_share_session": {
        const sessionId = await shareSession(args!.slug as string);
        return text(`Session shared! Your squad can now watch. ID: ${sessionId}`);
      }

      case "squads_unshare_session": {
        await unshareSession(args!.slug as string);
        return text("Session sharing stopped.");
      }

      case "squads_list_sessions": {
        const sessions = await listSessions(args!.slug as string);
        if (sessions.length === 0) return text("No active sessions.");
        const lines = sessions.map(
          (s) => `  ${s.github_username}'s session (started ${new Date(s.started_at).toLocaleTimeString()})`
        );
        return text(`Active sessions:\n${lines.join("\n")}`);
      }

      case "squads_ping": {
        const result = await pingUser(
          args!.username as string,
          args!.message as string | undefined,
          args!.slug as string | undefined
        );
        return text(
          `Pinged ${args!.username}! ${result.delivered ? "They should see a notification." : "Ping stored — they'll see it when they come online."}`
        );
      }

      case "squads_pings": {
        const pings = await getPendingPings();
        if (pings.length === 0) return text("No pings!");
        const lines = pings.map(
          (p) =>
            `  ${p.from_username}: "${p.message}" (${new Date(p.timestamp).toLocaleTimeString()})`
        );
        return text(`Your pings:\n${lines.join("\n")}`);
      }

      case "squads_emote": {
        const art = await sendEmote(
          args!.slug as string,
          args!.emote as string
        );
        return text(`Emote sent!\n${art}`);
      }

      case "squads_emotes": {
        return text(listEmotes());
      }

      default:
        return text(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Squads MCP server failed:", err);
  process.exit(1);
});
