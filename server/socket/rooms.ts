import type { Socket, Server as SocketServer } from "socket.io";
import {
  addUserToRoom,
  removeUserFromRoom,
  getRoomPresenceList,
  loadUserTier,
  socketRooms,
} from "./index.js";

// In-memory session tracking: roomSlug → Map<userId, sessionInfo>
const activeSessions = new Map<string, Map<string, { username: string; startedAt: string }>>();

export function registerRoomHandlers(io: SocketServer, socket: Socket) {
  const user = (socket as unknown as { user: { id: string; username: string } }).user;

  socket.on("join-room", async ({ slug }: { slug: string }) => {
    const roomKey = `room:${slug}`;
    socket.join(roomKey);

    // Track in socket's room set for disconnect cleanup
    socketRooms.get(socket.id)?.add(slug);

    // Load tier data for presence
    const { tier, xp } = await loadUserTier(user.id);

    // Add to presence
    addUserToRoom(io, slug, {
      id: user.id,
      username: user.username,
      status: "online",
      current_file: null,
      tier,
      xp,
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

  // ─── Ship Feed ───
  socket.on("ship", ({ slug, commitMessage, commitHash, projectName, isManual }: {
    slug: string; commitMessage: string; commitHash?: string; projectName?: string; isManual?: boolean;
  }) => {
    const payload = {
      username: user.username,
      userId: user.id,
      commitMessage,
      commitHash: commitHash || null,
      projectName: projectName || null,
      isManual: isManual ?? false,
      slug,
      timestamp: new Date().toISOString(),
    };
    io.to(`room:${slug}`).emit("ship", payload);
    // Auto-fire ship emote to celebrate
    io.to(`room:${slug}`).emit("emote", {
      username: user.username,
      userId: user.id,
      emote: "ship",
      slug,
    });
  });

  // ─── SOS Ping ───
  socket.on("sos-ping", ({ slug, error, currentFile, description, gitBranch }: {
    slug: string; error?: string; currentFile?: string; description: string; gitBranch?: string;
  }) => {
    const sosId = `sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      username: user.username,
      userId: user.id,
      error: error || null,
      currentFile: currentFile || null,
      description,
      gitBranch: gitBranch || null,
      slug,
      timestamp: new Date().toISOString(),
      sosId,
    };
    // Broadcast to room
    io.to(`room:${slug}`).emit("sos-ping", payload);
    // Also send to all sockets in lobby (friends will pick it up)
    io.to("lobby").emit("sos-ping", payload);
  });

  // ─── Squad Status Line Message ───
  socket.on("squad-message", ({ slug, message }: { slug: string; message: string }) => {
    io.to(`room:${slug}`).emit("squad-message", {
      username: user.username,
      userId: user.id,
      message: (message || "").slice(0, 50),
      slug,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Session Spectating Data Relay ───
  socket.on("session-data", ({ slug, events }: {
    slug: string;
    events: Array<{ type: string; summary: string; toolName?: string; timestamp: string }>;
  }) => {
    io.to(`room:${slug}`).emit("session-data", {
      username: user.username,
      userId: user.id,
      slug,
      events,
      timestamp: new Date().toISOString(),
    });
  });
}
