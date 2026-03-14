import { getSocket, joinRoom } from "./_socket.js";

interface SharedSession {
  user_id: string;
  github_username: string;
  session_id: string;
  started_at: string;
}

export async function shareSession(roomSlug: string): Promise<string> {
  joinRoom(roomSlug);
  const socket = getSocket();
  socket.emit("share-session", { slug: roomSlug });
  return `session-${Date.now()}`;
}

export async function unshareSession(roomSlug: string): Promise<void> {
  const socket = getSocket();
  socket.emit("unshare-session", { slug: roomSlug });
}

export async function listSessions(
  roomSlug: string
): Promise<SharedSession[]> {
  const socket = getSocket();
  return new Promise((resolve) => {
    socket.emit("list-sessions", { slug: roomSlug }, (data: any[]) => {
      resolve(
        data.map((s) => ({
          user_id: s.userId,
          github_username: s.username,
          session_id: `session-${s.userId}`,
          started_at: s.startedAt,
        }))
      );
    });

    // Timeout fallback
    setTimeout(() => resolve([]), 5000);
  });
}

export async function broadcastSessionEvent(
  roomSlug: string,
  event: { type: string; detail: string }
): Promise<void> {
  const socket = getSocket();
  socket.emit("post-activity", {
    slug: roomSlug,
    action: `session:${event.type}`,
    detail: event.detail,
  });
}
