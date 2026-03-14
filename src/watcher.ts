/**
 * Squads Watcher — background daemon that:
 * 1. Connects to the Express + Socket.io server
 * 2. Joins the lobby for online/offline detection
 * 3. Listens for DMs, invites, and room events via Socket.io
 * 4. Polls friends list via REST API
 * 5. Writes state to ~/.squads/state.json (for the overlay)
 * 6. Sends macOS notifications for messages/pings/invites
 *
 * Run: node dist/watcher.js
 * Run with mock data: SQUADS_MOCK=1 node dist/watcher.js
 */

import { io as ioClient, type Socket } from "socket.io-client";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// Load env
try {
  // @ts-ignore
  const { config } = await import("dotenv");
  config({ path: new URL("../.env", import.meta.url).pathname });
} catch {}

const SQUADS_DIR = join(homedir(), ".squads");
const STATE_FILE = join(SQUADS_DIR, "state.json");
const TOKEN_FILE = join(SQUADS_DIR, "token.json");
const SETTINGS_FILE = join(SQUADS_DIR, "settings.json");

// ─── Interfaces ───

interface RecentMessage {
  username: string;
  content: string;
  created_at: string;
}

interface FriendState {
  id: string;
  github_username: string;
  avatar_url: string | null;
  status: "pending" | "accepted";
  direction: "sent" | "received";
  is_online: boolean;
  tier?: string;
  xp?: number;
  badge_count?: number;
}

interface Invite {
  from_username: string;
  room_slug: string;
  room_name: string;
  timestamp: string;
}

interface State {
  room_name: string;
  room_slug: string;
  online: string[];
  unread: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_update: string;
  recent_messages: RecentMessage[];
  last_activity?: { action: string; detail: string; timestamp: string };
  friends: FriendState[];
  dm_messages: Record<string, RecentMessage[]>;
  pending_invites: Invite[];
  server_connected: boolean;
  gamification?: {
    xp: number;
    tier: string;
    badge_count: number;
    selected_border: string;
    available_borders: { id: string; name: string; type: string; icon?: string }[];
  };
  // Per-user tier data from presence (username → tier info)
  user_tiers?: Record<string, { tier: string; xp: number }>;
}

// ─── Helpers ───

function ensureDir() {
  if (!existsSync(SQUADS_DIR)) mkdirSync(SQUADS_DIR, { recursive: true });
}

function loadToken() {
  if (!existsSync(TOKEN_FILE)) return null;
  try { return JSON.parse(readFileSync(TOKEN_FILE, "utf-8")); } catch { return null; }
}

function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) return { current_room: null };
  try { return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")); } catch { return { current_room: null }; }
}

function getServerUrl(): string {
  return process.env.SQUADS_SERVER_URL ?? "http://localhost:3000";
}

function writeState(state: State) {
  ensureDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function notify(title: string, message: string) {
  const settings = loadSettings();
  if (settings.notifications === false) return;
  try {
    execSync(
      `osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"'`,
      { stdio: "ignore" }
    );
  } catch {}
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = loadToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token.access_token}`;

  const res = await fetch(`${getServerUrl()}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function getDmChannelId(userId1: string, userId2: string): string {
  return `dm:${[userId1, userId2].sort().join(":")}`;
}

// ─── Main ───

async function main() {
  // Mock mode moved to separate script (scripts/mock-watcher.ts)
  // to prevent accidental activation in packaged builds
  if (process.env.SQUADS_MOCK === "1") {
    console.log("Mock mode is no longer supported in the main watcher.");
    console.log("Use: npx tsx scripts/mock-watcher.ts");
    process.exit(0);
    return;
  }

  // ─── Real mode ───
  const token = loadToken();
  if (!token) {
    console.error("Not logged in. Run squads login first.");
    process.exit(1);
  }

  const serverUrl = getServerUrl();
  const username = token.user.github_username;
  const displayName = token.user.display_name ?? null;
  const avatarUrl = token.user.avatar_url ?? null;
  const userId = token.user.id;

  // ─── State ───
  let socket: Socket | null = null;
  let friendsPollInterval: ReturnType<typeof setInterval> | null = null;
  let settingsPollInterval: ReturnType<typeof setInterval> | null = null;

  let unreadCount = 0;
  let onlineUsers: string[] = [];
  let currentRoomSlug = "";
  let currentRoomName = "";
  let recentMessages: RecentMessage[] = [];
  let friends: FriendState[] = [];
  const dmMessages = new Map<string, RecentMessage[]>();
  let pendingInvites: Invite[] = [];
  const globalOnlineUsers = new Map<string, { username: string }>();
  let myGamification: State["gamification"];
  const userTiers = new Map<string, { tier: string; xp: number }>();
  let serverConnected = false;

  function updateState() {
    const dmObj: Record<string, RecentMessage[]> = {};
    for (const [k, v] of dmMessages) dmObj[k] = v.slice(-20);

    const tierObj: Record<string, { tier: string; xp: number }> = {};
    for (const [k, v] of userTiers) tierObj[k] = v;

    writeState({
      room_name: currentRoomName,
      room_slug: currentRoomSlug,
      online: onlineUsers,
      unread: unreadCount,
      username,
      display_name: displayName,
      avatar_url: avatarUrl,
      last_update: new Date().toISOString(),
      recent_messages: recentMessages.slice(-20),
      friends,
      dm_messages: dmObj,
      pending_invites: pendingInvites,
      server_connected: serverConnected,
      gamification: myGamification,
      user_tiers: tierObj,
    });
  }

  // ─── Connect Socket.io ───
  socket = ioClient(serverUrl, {
    auth: { token: token.access_token },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
  });

  socket.on("connect", () => {
    console.log("Connected to server via Socket.io");
    serverConnected = true;
    updateState();
    // Rejoin room on reconnect
    if (currentRoomSlug) {
      socket!.emit("join-room", { slug: currentRoomSlug });
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
    serverConnected = false;
    updateState();
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
    serverConnected = false;
    updateState();
  });

  // ─── Lobby presence ───
  socket.on("presence-update", ({ online }: { online: Array<{ id: string; username: string }> }) => {
    globalOnlineUsers.clear();
    for (const u of online) {
      globalOnlineUsers.set(u.id, { username: u.username });
    }
    // Update friends' online status
    for (const f of friends) {
      f.is_online = Array.from(globalOnlineUsers.values()).some(
        u => u.username === f.github_username
      );
    }
    updateState();
  });

  // ─── DMs (arrive on personal user:<id> room) ───
  socket.on("dm", ({ from, fromUsername, content, timestamp, isSelf }: any) => {
    const channelId = getDmChannelId(userId, from);
    const msgs = dmMessages.get(channelId) || [];
    msgs.push({
      username: fromUsername,
      content,
      created_at: timestamp || new Date().toISOString(),
    });
    if (msgs.length > 50) msgs.shift();
    dmMessages.set(channelId, msgs);

    if (!isSelf && fromUsername !== username) {
      notify(`DM from ${fromUsername}`, content);
    }
    updateState();
  });

  // ─── Invites (arrive on personal user:<id> room) ───
  socket.on("invite", ({ fromUsername, roomSlug, roomName, timestamp }: any) => {
    pendingInvites.push({
      from_username: fromUsername,
      room_slug: roomSlug,
      room_name: roomName,
      timestamp: timestamp || new Date().toISOString(),
    });
    if (pendingInvites.length > 20) pendingInvites.shift();
    notify("Squad Invite", `${fromUsername} invited you to ${roomName}`);
    updateState();
  });

  // ─── Room events ───
  socket.on("room-presence-sync", ({ slug, members }: { slug: string; members: any[] }) => {
    if (slug !== currentRoomSlug) return;
    onlineUsers = members
      .map((m: any) => m.username)
      .filter((n: string) => n && n !== username);
    // Extract tier data from presence
    for (const m of members) {
      if (m.username && m.tier) {
        userTiers.set(m.username, { tier: m.tier, xp: m.xp ?? 0 });
      }
    }
    updateState();
  });

  socket.on("new-message", ({ github_username, content, created_at }: any) => {
    recentMessages.push({
      username: github_username,
      content,
      created_at: created_at || new Date().toISOString(),
    });
    if (recentMessages.length > 50) recentMessages.shift();

    if (github_username !== username) {
      unreadCount++;
      notify(`${github_username} in ${currentRoomName}`, content);
    }
    updateState();
  });

  socket.on("ping", ({ from_username, message }: any) => {
    notify("Squade Code", `${from_username}: ${message}`);
  });

  socket.on("emote", ({ username: emoteUser, emote }: any) => {
    if (emoteUser !== username) {
      notify("Squade Code", `${emoteUser} ${emote}`);
    }
  });

  // ─── Friends polling ───
  async function fetchFriends() {
    try {
      const data = await apiFetch("/api/friends") as any[];

      const seen = new Set<string>();
      const result: FriendState[] = [];

      for (const row of data) {
        if (seen.has(row.friend_id)) continue;
        seen.add(row.friend_id);
        result.push({
          id: row.friend_id,
          github_username: row.github_username,
          avatar_url: row.avatar_url || null,
          status: row.status as "pending" | "accepted",
          direction: row.direction === "outgoing" ? "sent" : "received",
          is_online: Array.from(globalOnlineUsers.values()).some(
            u => u.username === row.github_username
          ),
        });
      }

      friends = result;
      updateState();
    } catch (err: any) {
      console.error("Failed to fetch friends:", err.message);
    }
  }

  // ─── Gamification polling ───
  async function fetchMyGamification() {
    try {
      const data = await apiFetch("/api/gamification/me");
      myGamification = {
        xp: data.xp ?? 0,
        tier: data.tier ?? "bronze",
        badge_count: data.badge_count ?? 0,
        selected_border: data.selected_border ?? "auto",
        available_borders: data.available_borders ?? [],
      };
      userTiers.set(username, { tier: myGamification.tier, xp: myGamification.xp });
      updateState();
    } catch {}
  }

  async function fetchFriendTiers() {
    try {
      const onlineFriends = friends
        .filter(f => f.status === "accepted")
        .map(f => f.github_username);
      if (onlineFriends.length === 0) return;

      const data = await apiFetch("/api/gamification/batch", {
        method: "POST",
        body: JSON.stringify({ usernames: onlineFriends }),
      });
      for (const [uname, info] of Object.entries(data as Record<string, any>)) {
        userTiers.set(uname, { tier: info.tier, xp: info.xp });
        const friend = friends.find(f => f.github_username === uname);
        if (friend) {
          friend.tier = info.tier;
          friend.xp = info.xp;
          friend.badge_count = info.badge_count;
        }
      }
      updateState();
    } catch {}
  }

  // ─── Room watching ───
  async function watchRoom(slug: string) {
    // Leave current room if any
    if (currentRoomSlug && socket) {
      socket.emit("leave-room", { slug: currentRoomSlug });
    }

    // Look up room details via REST
    try {
      const room = await apiFetch(`/api/rooms/${encodeURIComponent(slug)}`);
      currentRoomSlug = room.slug;
      currentRoomName = room.name;
    } catch (err: any) {
      console.error(`Room "${slug}" not found:`, err.message);
      return;
    }

    unreadCount = 0;
    recentMessages = [];

    // Join room via Socket.io
    if (socket) {
      socket.emit("join-room", { slug });
    }

    updateState();
    console.log(`Watching room: ${currentRoomName} (${currentRoomSlug})`);
  }

  // ─── Cleanup ───
  function cleanup() {
    console.log("Cleaning up...");
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    if (friendsPollInterval) clearInterval(friendsPollInterval);
    if (settingsPollInterval) clearInterval(settingsPollInterval);
  }

  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  // ─── Start everything ───
  await fetchFriends();

  // Check settings for current room, or watch first joined room
  const settings = loadSettings();
  let roomToWatch = settings.current_room;

  if (!roomToWatch) {
    try {
      const myRooms = await apiFetch("/api/rooms/mine") as any[];
      if (myRooms.length > 0) {
        roomToWatch = myRooms[0].slug;
      }
    } catch (err: any) {
      console.error("Failed to fetch rooms:", err.message);
    }
  }

  if (roomToWatch) {
    await watchRoom(roomToWatch);
  } else {
    console.log("No room to watch. Join a room first.");
    updateState();
  }

  // Fetch gamification data
  await fetchMyGamification();
  await fetchFriendTiers();

  console.log(`Squade Code watcher running for ${username}. Ctrl+C to stop.`);

  // Poll friends every 30s
  friendsPollInterval = setInterval(fetchFriends, 30_000);

  // Poll gamification every 5 min (own stats) and 2 min (friend tiers)
  setInterval(fetchMyGamification, 5 * 60_000);
  setInterval(fetchFriendTiers, 2 * 60_000);

  // Re-read settings every 10s for room changes
  settingsPollInterval = setInterval(async () => {
    const newSettings = loadSettings();
    if (newSettings.current_room && newSettings.current_room !== currentRoomSlug) {
      await watchRoom(newSettings.current_room);
    }
  }, 10_000);
}

async function mainWithRetry() {
  let backoff = 2000;
  const MAX_BACKOFF = 30000;

  while (true) {
    try {
      await main();
      // main() runs indefinitely on success, so if it returns we just restart
      break;
    } catch (err: any) {
      console.error(`Watcher error: ${err.message} — retrying in ${backoff / 1000}s`);
      // Write a minimal offline state so overlay can show disconnected status
      ensureDir();
      const token = loadToken();
      if (token) {
        writeState({
          room_name: "",
          room_slug: "",
          online: [],
          unread: 0,
          username: token.user?.github_username || "",
          display_name: token.user?.display_name ?? null,
          avatar_url: token.user?.avatar_url ?? null,
          last_update: new Date().toISOString(),
          recent_messages: [],
          friends: [],
          dm_messages: {},
          pending_invites: [],
          server_connected: false,
        });
      }
      await new Promise(resolve => setTimeout(resolve, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

mainWithRetry();
