import type { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { registerRoomHandlers } from "./rooms.js";
import { registerDmHandlers } from "./dm.js";
import { registerInviteHandlers } from "./invites.js";

export interface PresenceInfo {
  id: string;
  username: string;
  avatar_url?: string;
  status?: string;
  current_file?: string | null;
}

const onlineUsers = new Map<string, { id: string; username: string }>();

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
      (socket as unknown as { user: { id: string; username: string } }).user = {
        id: payload.sub,
        username: payload.username,
      };
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as unknown as { user: { id: string; username: string } }).user;

    // Join personal room and lobby
    socket.join(`user:${user.id}`);
    socket.join("lobby");

    // Track online status
    onlineUsers.set(user.id, { id: user.id, username: user.username });
    io.to("lobby").emit("presence-update", {
      online: Array.from(onlineUsers.values()),
    });

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
