/**
 * Shared Socket.io client for MCP tools.
 * Lazy-initialized singleton — connects on first use.
 * Auto-refreshes expired tokens and reconnects.
 */
import { io as ioClient, type Socket } from "socket.io-client";
import { loadToken, getServerUrl, isTokenExpiringSoon } from "../../shared/config.js";
import { refreshAccessToken } from "../../shared/api-client.js";

let socket: Socket | null = null;
const joinedRooms = new Set<string>();

// Per-room presence cache updated by server events
const presenceCache = new Map<string, Array<{ id: string; username: string; status?: string; current_file?: string | null }>>();

function createSocket(accessToken: string): Socket {
  const s = ioClient(getServerUrl(), {
    auth: { token: accessToken },
    reconnection: true,
    reconnectionDelay: 2000,
  });

  s.on("room-presence-sync", ({ slug, members }: any) => {
    presenceCache.set(slug, members);
  });

  // On auth error, try refreshing the token and reconnecting
  s.on("connect_error", async (err) => {
    if (!err.message.includes("expired") && !err.message.includes("Invalid")) return;

    const refreshed = await refreshAccessToken();
    if (!refreshed) return;

    // Reconnect with the fresh token
    s.auth = { token: refreshed.access_token };
    s.connect();
  });

  return s;
}

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  let token = loadToken();
  if (!token) throw new Error("Not logged in");

  // Proactively refresh if near expiry before connecting
  if (isTokenExpiringSoon(token)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) token = refreshed;
  }

  // Tear down stale socket if it exists but isn't connected
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = createSocket(token.access_token);
  return socket;
}

export function getJoinedRooms(): Set<string> {
  return joinedRooms;
}

export async function joinRoom(slug: string) {
  const s = await getSocket();
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
