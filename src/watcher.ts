/**
 * Squads Watcher — background daemon that:
 * 1. Subscribes to Supabase Realtime for the user's current room
 * 2. Joins a global lobby channel for online/offline detection
 * 3. Polls friends list and cross-references with global presence
 * 4. Subscribes to DM channels for accepted friends
 * 5. Writes state to ~/.squads/state.json (for the overlay)
 * 6. Sends macOS notifications for messages/pings/invites
 *
 * Run: node dist/watcher.js
 * Run with mock data: SQUADS_MOCK=1 node dist/watcher.js
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

function getDmChannelId(userId1: string, userId2: string): string {
  return `dm:${[userId1, userId2].sort().join(":")}`;
}

// ─── Mock data ───

const MOCK_FRIENDS: FriendState[] = [
  { id: "m1", github_username: "torvalds", avatar_url: null, status: "accepted", direction: "sent", is_online: true },
  { id: "m2", github_username: "gaearon", avatar_url: null, status: "accepted", direction: "sent", is_online: true },
  { id: "m3", github_username: "sindresorhus", avatar_url: null, status: "accepted", direction: "received", is_online: true },
  { id: "m4", github_username: "tj", avatar_url: null, status: "accepted", direction: "sent", is_online: false },
  { id: "m5", github_username: "mrdoob", avatar_url: null, status: "accepted", direction: "received", is_online: false },
  { id: "m6", github_username: "defunkt", avatar_url: null, status: "accepted", direction: "sent", is_online: true },
  { id: "m7", github_username: "mojombo", avatar_url: null, status: "accepted", direction: "received", is_online: false },
  { id: "m8", github_username: "holman", avatar_url: null, status: "accepted", direction: "sent", is_online: false },
  { id: "m9", github_username: "fat", avatar_url: null, status: "pending", direction: "received", is_online: true },
  { id: "m10", github_username: "addyosmani", avatar_url: null, status: "pending", direction: "sent", is_online: false },
  { id: "m11", github_username: "rauchg", avatar_url: null, status: "accepted", direction: "sent", is_online: true },
  { id: "m12", github_username: "yyx990803", avatar_url: null, status: "accepted", direction: "received", is_online: false },
];

// ─── Main ───

async function main() {
  const isMock = process.env.SQUADS_MOCK === "1";

  if (isMock) {
    console.log("Running in MOCK mode — fake friends data, no Supabase.");
    const mockUsername = "testpilot";
    const mockState: State = {
      room_name: "The Ship Crew",
      room_slug: "the-ship-crew",
      online: ["torvalds", "gaearon", "sindresorhus", "defunkt", "rauchg"],
      unread: 0,
      username: mockUsername,
      display_name: "Test Pilot",
      avatar_url: "https://github.com/testpilot.png",
      last_update: new Date().toISOString(),
      recent_messages: [
        { username: "torvalds", content: "just pushed a kernel patch", created_at: new Date(Date.now() - 60000).toISOString() },
        { username: "gaearon", content: "nice! reviewing now", created_at: new Date(Date.now() - 30000).toISOString() },
      ],
      friends: MOCK_FRIENDS,
      dm_messages: {
        "dm:m1:self": [
          { username: "torvalds", content: "hey, check out this commit", created_at: new Date(Date.now() - 120000).toISOString() },
          { username: mockUsername, content: "looks great!", created_at: new Date(Date.now() - 90000).toISOString() },
        ],
      },
      pending_invites: [
        { from_username: "fat", room_slug: "debug-dungeon", room_name: "Debug Dungeon", timestamp: new Date().toISOString() },
      ],
    };
    writeState(mockState);
    console.log(`Mock state written to ${STATE_FILE}`);

    // Keep alive, re-write every 5s to keep overlay updated
    setInterval(() => {
      mockState.last_update = new Date().toISOString();
      writeState(mockState);
    }, 5000);
    return;
  }

  // ─── Real mode ───
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const token = loadToken();
  if (!token) {
    console.error("Not logged in. Run squads login first.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await supabase.auth.setSession({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
  });

  const username = token.user.github_username;
  const displayName = token.user.display_name ?? null;
  const avatarUrl = token.user.avatar_url ?? null;
  const userId = token.user.id;

  // ─── State ───
  let currentChannel: RealtimeChannel | null = null;
  let lobbyChannel: RealtimeChannel | null = null;
  let inviteChannel: RealtimeChannel | null = null;
  const dmChannels = new Map<string, RealtimeChannel>();
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
  const globalOnlineUsers = new Map<string, { github_username: string; avatar_url: string | null }>();

  function updateState() {
    const dmObj: Record<string, RecentMessage[]> = {};
    for (const [k, v] of dmMessages) dmObj[k] = v.slice(-20);

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
    });
  }

  // ─── Global lobby presence ───
  async function joinLobby() {
    lobbyChannel = supabase.channel("presence:lobby", {
      config: { presence: { key: userId } },
    });

    lobbyChannel.on("presence", { event: "sync" }, () => {
      const state = lobbyChannel!.presenceState();
      globalOnlineUsers.clear();
      for (const presences of Object.values(state)) {
        const p = (presences as any[])[0];
        if (p?.github_username) {
          globalOnlineUsers.set(p.user_id || p.github_username, {
            github_username: p.github_username,
            avatar_url: p.avatar_url,
          });
        }
      }
      // Update friends' online status
      for (const f of friends) {
        f.is_online = Array.from(globalOnlineUsers.values()).some(
          u => u.github_username === f.github_username
        );
      }
      updateState();
    });

    lobbyChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await lobbyChannel!.track({
          user_id: userId,
          github_username: username,
          avatar_url: token.user.avatar_url,
          online_at: new Date().toISOString(),
        });
      }
    });
  }

  // ─── Friends polling ───
  async function fetchFriends() {
    try {
      const { data: sent } = await supabase
        .from("friends")
        .select("status, friend:users!friends_friend_id_fkey(id, github_username, avatar_url)")
        .eq("user_id", userId);

      const { data: received } = await supabase
        .from("friends")
        .select("status, friend:users!friends_user_id_fkey(id, github_username, avatar_url)")
        .eq("friend_id", userId);

      const seen = new Set<string>();
      const result: FriendState[] = [];

      for (const row of (sent || [])) {
        const f = row.friend as any;
        if (!f || seen.has(f.id)) continue;
        seen.add(f.id);
        result.push({
          id: f.id,
          github_username: f.github_username,
          avatar_url: f.avatar_url,
          status: row.status as "pending" | "accepted",
          direction: "sent",
          is_online: Array.from(globalOnlineUsers.values()).some(
            u => u.github_username === f.github_username
          ),
        });
      }

      for (const row of (received || [])) {
        const f = row.friend as any;
        if (!f || seen.has(f.id)) continue;
        seen.add(f.id);
        result.push({
          id: f.id,
          github_username: f.github_username,
          avatar_url: f.avatar_url,
          status: row.status as "pending" | "accepted",
          direction: "received",
          is_online: Array.from(globalOnlineUsers.values()).some(
            u => u.github_username === f.github_username
          ),
        });
      }

      friends = result;

      // Subscribe to DM channels for accepted friends
      const acceptedIds = new Set(
        result.filter(f => f.status === "accepted").map(f => f.id)
      );

      // Subscribe new
      for (const fid of acceptedIds) {
        const chId = getDmChannelId(userId, fid);
        if (!dmChannels.has(chId)) {
          subscribeDmChannel(fid, chId);
        }
      }

      // Unsubscribe removed
      for (const [chId, ch] of dmChannels) {
        const friendId = chId.replace("dm:", "").split(":").find(id => id !== userId);
        if (friendId && !acceptedIds.has(friendId)) {
          await ch.unsubscribe();
          dmChannels.delete(chId);
        }
      }

      updateState();
    } catch (err: any) {
      console.error("Failed to fetch friends:", err.message);
    }
  }

  // ─── DM channels ───
  function subscribeDmChannel(friendId: string, channelId: string) {
    const channel = supabase.channel(channelId);

    channel.on("broadcast", { event: "dm" }, ({ payload }: any) => {
      const msgs = dmMessages.get(channelId) || [];
      msgs.push({
        username: payload.username,
        content: payload.content,
        created_at: payload.created_at || new Date().toISOString(),
      });
      if (msgs.length > 50) msgs.shift();
      dmMessages.set(channelId, msgs);

      if (payload.username !== username) {
        notify(`DM from ${payload.username}`, payload.content);
      }
      updateState();
    });

    channel.subscribe();
    dmChannels.set(channelId, channel);
  }

  // ─── Squad invites ───
  async function joinInviteChannel() {
    inviteChannel = supabase.channel(`invites:${userId}`);

    inviteChannel.on("broadcast", { event: "squad_invite" }, ({ payload }: any) => {
      pendingInvites.push({
        from_username: payload.from_username,
        room_slug: payload.room_slug,
        room_name: payload.room_name,
        timestamp: new Date().toISOString(),
      });
      if (pendingInvites.length > 20) pendingInvites.shift();
      notify("Squad Invite", `${payload.from_username} invited you to ${payload.room_name}`);
      updateState();
    });

    await inviteChannel.subscribe();
  }

  // ─── Room watching ───
  async function watchRoom(slug: string) {
    if (currentChannel) {
      await currentChannel.unsubscribe();
    }

    const { data: room } = await supabase
      .from("rooms")
      .select("id, name, slug")
      .eq("slug", slug)
      .single();

    if (!room) {
      console.error(`Room "${slug}" not found`);
      return;
    }

    currentRoomSlug = room.slug;
    currentRoomName = room.name;
    unreadCount = 0;

    const channel = supabase.channel(`room:${slug}`, {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      onlineUsers = Object.values(state)
        .flatMap((p: any) => p)
        .map((p: any) => p.github_username)
        .filter((n: string) => n && n !== username);
      updateState();
    });

    channel.on("presence", { event: "join" }, ({ newPresences }) => {
      for (const p of newPresences as any[]) {
        if (p.github_username && p.github_username !== username) {
          notify("Squade Code", `${p.github_username} joined ${currentRoomName}`);
        }
      }
    });

    channel.on("broadcast", { event: "new_message" }, ({ payload }: any) => {
      recentMessages.push({
        username: payload.username,
        content: payload.content,
        created_at: payload.created_at || new Date().toISOString(),
      });
      if (recentMessages.length > 50) recentMessages.shift();

      if (payload.username !== username) {
        unreadCount++;
        notify(`${payload.username} in ${currentRoomName}`, payload.content);
      }
      updateState();
    });

    channel.on("broadcast", { event: "ping" }, ({ payload }: any) => {
      if (payload.to_username === username) {
        notify("Squade Code", `${payload.from_username}: ${payload.message}`);
      }
    });

    channel.on("broadcast", { event: "emote" }, ({ payload }: any) => {
      if (payload.github_username !== username) {
        notify("Squade Code", `${payload.github_username} ${payload.emote}`);
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          github_username: username,
          avatar_url: token.user.avatar_url,
          status: "online",
          current_file: null,
          online_at: new Date().toISOString(),
        });
      }
    });

    currentChannel = channel;
    updateState();
    console.log(`Watching room: ${currentRoomName} (${currentRoomSlug})`);
  }

  // ─── Cleanup ───
  async function cleanup() {
    console.log("Cleaning up...");
    if (lobbyChannel) {
      await lobbyChannel.untrack().catch(() => {});
      await lobbyChannel.unsubscribe().catch(() => {});
    }
    if (inviteChannel) {
      await inviteChannel.unsubscribe().catch(() => {});
    }
    for (const [, ch] of dmChannels) {
      await ch.unsubscribe().catch(() => {});
    }
    dmChannels.clear();
    if (currentChannel) {
      await currentChannel.unsubscribe().catch(() => {});
    }
    if (friendsPollInterval) clearInterval(friendsPollInterval);
    if (settingsPollInterval) clearInterval(settingsPollInterval);
  }

  process.on("SIGINT", async () => { await cleanup(); process.exit(0); });
  process.on("SIGTERM", async () => { await cleanup(); process.exit(0); });

  // ─── Start everything ───
  await joinLobby();
  await joinInviteChannel();
  await fetchFriends();

  // Check settings for current room, or watch first joined room
  const settings = loadSettings();
  let roomToWatch = settings.current_room;

  if (!roomToWatch) {
    const { data: membership } = await supabase
      .from("room_members")
      .select("rooms(slug)")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (membership) {
      roomToWatch = (membership.rooms as any)?.slug;
    }
  }

  if (roomToWatch) {
    await watchRoom(roomToWatch);
  } else {
    console.log("No room to watch. Join a room first.");
    updateState();
  }

  console.log(`Squade Code watcher running for ${username}. Ctrl+C to stop.`);

  // Poll friends every 30s
  friendsPollInterval = setInterval(fetchFriends, 30_000);

  // Re-read settings every 10s for room changes
  settingsPollInterval = setInterval(async () => {
    const newSettings = loadSettings();
    if (newSettings.current_room && newSettings.current_room !== currentRoomSlug) {
      await watchRoom(newSettings.current_room);
    }
  }, 10_000);
}

main().catch((err) => {
  console.error("Watcher crashed:", err.message);
  process.exit(1);
});
