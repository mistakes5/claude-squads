import type { PresenceState } from "../../shared/types.js";
import { getSocket, joinRoom, leaveRoom, getRoomPresence, getJoinedRooms } from "./_socket.js";

export async function trackPresence(
  roomSlug: string,
  status: string = "online"
): Promise<void> {
  joinRoom(roomSlug);
  const socket = getSocket();
  socket.emit("set-status", { slug: roomSlug, status });
}

export async function updateStatus(
  roomSlug: string,
  status: string,
  currentFile?: string
): Promise<void> {
  const socket = getSocket();
  socket.emit("set-status", {
    slug: roomSlug,
    status,
    currentFile: currentFile || null,
  });
}

export function getPresence(roomSlug: string): PresenceState[] {
  const members = getRoomPresence(roomSlug);
  return members.map((m) => ({
    github_username: m.username,
    avatar_url: null,
    status: m.status || "online",
    current_file: m.current_file || null,
    online_at: new Date().toISOString(),
  }));
}

export async function untrackPresence(roomSlug: string): Promise<void> {
  leaveRoom(roomSlug);
}

export function getActiveChannels(): Map<string, any> {
  const map = new Map<string, any>();
  for (const slug of getJoinedRooms()) {
    map.set(slug, true);
  }
  return map;
}
