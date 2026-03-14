import { getSupabase } from "../../shared/supabase.js";
import { loadToken } from "../../shared/config.js";
import { getActiveChannels } from "./presence.js";

interface SharedSession {
  user_id: string;
  github_username: string;
  session_id: string;
  started_at: string;
}

// In-memory tracking of shared sessions per room
const sharedSessions = new Map<string, SharedSession>();

/**
 * Share your current Claude Code session with the room (spectator mode).
 * Other squad members can see your session activity in real-time.
 */
export async function shareSession(roomSlug: string): Promise<string> {
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session: SharedSession = {
    user_id: token.user.id,
    github_username: token.user.github_username,
    session_id: sessionId,
    started_at: new Date().toISOString(),
  };

  sharedSessions.set(roomSlug, session);

  // Broadcast session start
  const channel = getActiveChannels().get(roomSlug);
  if (channel) {
    await channel.send({
      type: "broadcast",
      event: "session_start",
      payload: session,
    });
  }

  return sessionId;
}

/**
 * Stop sharing your session.
 */
export async function unshareSession(roomSlug: string): Promise<void> {
  const session = sharedSessions.get(roomSlug);
  if (!session) return;

  const channel = getActiveChannels().get(roomSlug);
  if (channel) {
    await channel.send({
      type: "broadcast",
      event: "session_end",
      payload: { session_id: session.session_id },
    });
  }

  sharedSessions.delete(roomSlug);
}

/**
 * List active shared sessions in a room.
 * In a real implementation, this would query from presence state.
 */
export async function listSessions(
  _roomSlug: string
): Promise<SharedSession[]> {
  // For MVP, sessions are tracked via broadcast events
  // The TUI listens for session_start/session_end events
  // This returns locally known sessions
  return Array.from(sharedSessions.values());
}

/**
 * Broadcast a session event (tool use, file edit, etc.) to spectators.
 */
export async function broadcastSessionEvent(
  roomSlug: string,
  event: { type: string; detail: string }
): Promise<void> {
  const session = sharedSessions.get(roomSlug);
  if (!session) return;

  const channel = getActiveChannels().get(roomSlug);
  if (channel) {
    await channel.send({
      type: "broadcast",
      event: "session_event",
      payload: {
        session_id: session.session_id,
        github_username: session.github_username,
        ...event,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
