import type { Socket, Server as SocketServer } from "socket.io";
import {
  addUserToRoom,
  removeUserFromRoom,
  getRoomPresenceList,
  socketRooms,
} from "./index.js";

// In-memory session tracking: roomSlug → Map<userId, sessionInfo>
const activeSessions = new Map<string, Map<string, { username: string; startedAt: string }>>();

export function registerRoomHandlers(io: SocketServer, socket: Socket) {
  const user = (socket as unknown as { user: { id: string; username: string } }).user;

  socket.on("join-room", ({ slug }: { slug: string }) => {
    const roomKey = `room:${slug}`;
    socket.join(roomKey);

    // Track in socket's room set for disconnect cleanup
    socketRooms.get(socket.id)?.add(slug);

    // Add to presence
    addUserToRoom(io, slug, {
      id: user.id,
      username: user.username,
      status: "online",
      current_file: null,
    });
  });

  socket.on("leave-room", ({ slug }: { slug: string }) => {
    const roomKey = `room:${slug}`;
    socketRooms.get(socket.id)?.delete(slug);
    removeUserFromRoom(io, slug, user.id);

    // Clean up any active session
    activeSessions.get(slug)?.delete(user.id);

    socket.leave(roomKey);
  });

  socket.on("send-emote", ({ slug, emote }: { slug: string; emote: string }) => {
    io.to(`room:${slug}`).emit("emote", {
      username: user.username,
      userId: user.id,
      emote,
      slug,
    });
  });

  // Activity broadcast
  socket.on("post-activity", ({ slug, action, detail }: { slug: string; action: string; detail?: string }) => {
    io.to(`room:${slug}`).emit("activity", {
      username: user.username,
      userId: user.id,
      action,
      detail: detail || null,
      slug,
      timestamp: new Date().toISOString(),
    });
  });

  // Session sharing
  socket.on("share-session", ({ slug }: { slug: string }) => {
    if (!activeSessions.has(slug)) activeSessions.set(slug, new Map());
    activeSessions.get(slug)!.set(user.id, {
      username: user.username,
      startedAt: new Date().toISOString(),
    });
    io.to(`room:${slug}`).emit("session-update", {
      type: "started",
      username: user.username,
      userId: user.id,
      slug,
    });
  });

  socket.on("unshare-session", ({ slug }: { slug: string }) => {
    activeSessions.get(slug)?.delete(user.id);
    io.to(`room:${slug}`).emit("session-update", {
      type: "ended",
      username: user.username,
      userId: user.id,
      slug,
    });
  });

  // List sessions (with ack callback)
  socket.on("list-sessions", ({ slug }: { slug: string }, callback: (data: any) => void) => {
    const sessions = activeSessions.get(slug);
    const list = sessions ? Array.from(sessions.entries()).map(([id, info]) => ({
      userId: id,
      username: info.username,
      startedAt: info.startedAt,
    })) : [];
    if (typeof callback === "function") callback(list);
  });

  // Get room presence (with ack callback — for initial hydration)
  socket.on("get-room-presence", ({ slug }: { slug: string }, callback: (data: any) => void) => {
    if (typeof callback === "function") {
      callback({ slug, members: getRoomPresenceList(slug) });
    }
  });
}
