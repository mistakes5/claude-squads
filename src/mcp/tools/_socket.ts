/**
 * Shared Socket.io client for MCP tools.
 * Lazy-initialized singleton — connects on first use.
 */
import { io as ioClient, type Socket } from "socket.io-client";
import { loadToken, getServerUrl } from "../../shared/config.js";

let socket: Socket | null = null;
const joinedRooms = new Set<string>();

// Per-room presence cache updated by server events
const presenceCache = new Map<string, Array<{ id: string; username: string; status?: string; current_file?: string | null }>>();

export function getSocket(): Socket {
  if (socket?.connected) return socket;

  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  socket = ioClient(getServerUrl(), {
    auth: { token: token.access_token },
    reconnection: true,
    reconnectionDelay: 2000,
  });

  // Listen for room presence updates
  socket.on("room-presence-sync", ({ slug, members }: any) => {
    presenceCache.set(slug, members);
  });

  return socket;
}

export function getJoinedRooms(): Set<string> {
  return joinedRooms;
}

export function joinRoom(slug: string) {
  const s = getSocket();
  if (!joinedRooms.has(slug)) {
    s.emit("join-room", { slug });
    joinedRooms.add(slug);
  }
}

export function leaveRoom(slug: string) {
  if (socket && joinedRooms.has(slug)) {
    socket.emit("leave-room", { slug });
    joinedRooms.delete(slug);
    presenceCache.delete(slug);
  }
}

export function getRoomPresence(slug: string) {
  return presenceCache.get(slug) || [];
}

export function disconnectSocket() {
  if (socket) {
    joinedRooms.clear();
    presenceCache.clear();
    socket.disconnect();
    socket = null;
  }
}

// Clean up on process exit
process.on("exit", disconnectSocket);
