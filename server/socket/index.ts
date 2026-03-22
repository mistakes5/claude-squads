import type { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { registerRoomHandlers } from "./rooms.js";
import { registerDmHandlers } from "./dm.js";
import { registerInviteHandlers } from "./invites.js";

export interface PresenceInfo {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string;
  status?: string;
  current_file?: string | null;
  tier?: string;
  xp?: number;
}

// In-memory tier cache: userId → { tier, xp }
const tierCache = new Map<string, { tier: string; xp: number }>();

export async function loadUserTier(userId: string): Promise<{ tier: string; xp: number }> {
  const cached = tierCache.get(userId);
  if (cached) return cached;
  try {
    const { query } = await import("../db.js");
    const result = await query("SELECT tier, xp FROM user_github_stats WHERE user_id = $1", [userId]);
    const data = result.rows.length > 0
      ? { tier: result.rows[0].tier, xp: result.rows[0].xp }
      : { tier: "bronze", xp: 0 };
    tierCache.set(userId, data);
    // Expire cache after 10 minutes
    setTimeout(() => tierCache.delete(userId), 10 * 60 * 1000);
    return data;
  } catch {
    return { tier: "bronze", xp: 0 };
  }
}

export function updateTierCache(userId: string, tier: string, xp: number) {
  tierCache.set(userId, { tier, xp });
}

const onlineUsers = new Map<string, { id: string; username: string; display_name?: string | null; status?: string }>();

// Per-room presence: roomSlug → Map<userId, PresenceInfo>
export const roomPresence = new Map<string, Map<string, PresenceInfo>>();

// Track which rooms each socket is in (for cleanup on disconnect)
const socketRooms = new Map<string, Set<string>>();

export function getRoomPresenceList(slug: string): PresenceInfo[] {
  const members = roomPresence.get(slug);
  return members ? Array.from(members.values()) : [];
}

export function emitRoomPresence(io: SocketServer, slug: string) {
  io.to(`room:${slug}`).emit("room-presence-sync", {
    slug,
    members: getRoomPresenceList(slug),
  });
}

export function addUserToRoom(
  io: SocketServer,
  slug: string,
  user: PresenceInfo,
) {
  if (!roomPresence.has(slug)) roomPresence.set(slug, new Map());
  roomPresence.get(slug)!.set(user.id, user);
  emitRoomPresence(io, slug);
}

export function removeUserFromRoom(
  io: SocketServer,
  slug: string,
  userId: string,
) {
  const members = roomPresence.get(slug);
  if (members) {
    members.delete(userId);
    if (members.size === 0) roomPresence.delete(slug);
  }
  emitRoomPresence(io, slug);
}

export function setupSocketHandlers(io: SocketServer) {
  // Socket.io auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
        sub: string;
        username: string;
      };
      (socket as unknown as { user: { id: string; username: string; display_name?: string | null } }).user = {
        id: payload.sub,
        username: payload.username,
        display_name: null,
      };
      // Resolve display_name + real UUID from DB (async, non-blocking)
      import("../db.js").then(({ query }) =>
        query(`SELECT id, display_name FROM users WHERE github_id = $1 OR id::text = $1`, [payload.sub])
      ).then((result) => {
        if (result.rows.length > 0) {
          const u = (socket as any).user;
          u.id = result.rows[0].id;
          u.display_name = result.rows[0].display_name || null;
        }
      }).catch(() => {});
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as unknown as { user: { id: string; username: string; display_name?: string | null } }).user;

    // Join personal room and lobby
    socket.join(`user:${user.id}`);
    socket.join("lobby");

    // Track online status (display_name may be resolved async, update after short delay)
    onlineUsers.set(user.id, { id: user.id, username: user.username, display_name: user.display_name });
    io.to("lobby").emit("presence-update", {
      online: Array.from(onlineUsers.values()),
    });
    // Re-emit after DB lookup completes (display_name may have updated)
    setTimeout(() => {
      onlineUsers.set(user.id, { id: user.id, username: user.username, display_name: user.display_name });
      io.to("lobby").emit("presence-update", {
        online: Array.from(onlineUsers.values()),
      });
    }, 1000);

    // Track socket's joined rooms for disconnect cleanup
    socketRooms.set(socket.id, new Set());

    // Register handlers
    registerRoomHandlers(io, socket);
    registerDmHandlers(io, socket);
    registerInviteHandlers(io, socket);

    // Set status in a room
    socket.on("set-status", ({ slug, status, currentFile }: { slug: string; status?: string; currentFile?: string | null }) => {
      const members = roomPresence.get(slug);
      if (members && members.has(user.id)) {
        const existing = members.get(user.id)!;
        existing.status = status || existing.status;
        existing.current_file = currentFile !== undefined ? currentFile : existing.current_file;
        emitRoomPresence(io, slug);
      }

      // Also update lobby presence so friends can see tool status
      const lobbyEntry = onlineUsers.get(user.id);
      if (lobbyEntry && status) {
        lobbyEntry.status = status;
        io.to("lobby").emit("presence-update", {
          online: Array.from(onlineUsers.values()),
        });
      }
    });

    socket.on("disconnect", () => {
      // Clean up room presence for all rooms this socket was in
      const rooms = socketRooms.get(socket.id);
      if (rooms) {
        for (const slug of rooms) {
          removeUserFromRoom(io, slug, user.id);
        }
        socketRooms.delete(socket.id);
      }

      onlineUsers.delete(user.id);
      io.to("lobby").emit("presence-update", {
        online: Array.from(onlineUsers.values()),
      });
    });
  });
}

export { socketRooms };
