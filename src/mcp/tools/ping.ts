import { getSupabase } from "../../shared/supabase.js";
import { loadToken } from "../../shared/config.js";
import { getActiveChannels } from "./presence.js";

interface PingPayload {
  from_username: string;
  from_id: string;
  to_username: string;
  message: string;
  timestamp: string;
}

/**
 * Ping/nudge a squad member to get them on Claude Code.
 *
 * Delivery chain:
 * 1. Broadcast to room channel (instant if they have TUI open)
 * 2. Store in DB as a "ping" activity (they see it when they come online)
 * 3. Trigger system notification if they're on the same machine (macOS/Linux)
 */
export async function pingUser(
  targetUsername: string,
  message?: string,
  roomSlug?: string
): Promise<{ delivered: boolean; method: string }> {
  const supabase = getSupabase();
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  // Find the target user
  const { data: target } = await supabase
    .from("users")
    .select("id, github_username")
    .eq("github_username", targetUsername)
    .single();

  if (!target) {
    throw new Error(
      `User "${targetUsername}" not found. They need to log in to Squads first.`
    );
  }

  const pingMessage = message ?? `${token.user.github_username} wants you on Claude Code!`;

  const payload: PingPayload = {
    from_username: token.user.github_username,
    from_id: token.user.id,
    to_username: targetUsername,
    message: pingMessage,
    timestamp: new Date().toISOString(),
  };

  let delivered = false;
  let method = "stored";

  // 1. Try broadcast to any room they share
  if (roomSlug) {
    const channel = getActiveChannels().get(roomSlug);
    if (channel) {
      await channel.send({
        type: "broadcast",
        event: "ping",
        payload,
      });
      delivered = true;
      method = "broadcast";
    }
  } else {
    // Broadcast to all active channels
    for (const [slug, channel] of getActiveChannels()) {
      await channel.send({
        type: "broadcast",
        event: "ping",
        payload,
      });
      delivered = true;
      method = "broadcast";
    }
  }

  // 2. Store the ping in the DB so they see it even if offline
  await supabase.from("activities").insert({
    room_id: null, // pings can be roomless
    user_id: token.user.id,
    action: "ping",
    detail: JSON.stringify({
      to: target.id,
      to_username: targetUsername,
      message: pingMessage,
    }),
  });

  // 3. Broadcast on user-specific channel so TUI picks it up regardless of room
  const userChannel = supabase.channel(`user:${target.id}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        userChannel.unsubscribe();
        reject(new Error("Channel subscribe timed out"));
      }, 5000);

      userChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await userChannel.send({
            type: "broadcast",
            event: "ping",
            payload,
          });
          clearTimeout(timeout);
          await userChannel.unsubscribe();
          resolve();
        }
      });
    });
  } catch {
    // Best-effort — ping was already stored in DB
  }

  return { delivered, method };
}

/**
 * Get pending pings for the current user.
 */
export async function getPendingPings(): Promise<PingPayload[]> {
  const supabase = getSupabase();
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  const { data } = await supabase
    .from("activities")
    .select("*, users(*)")
    .eq("action", "ping")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data) return [];

  // Filter pings addressed to this user
  return data
    .filter((a: any) => {
      try {
        const detail = JSON.parse(a.detail);
        return detail.to === token.user.id;
      } catch {
        return false;
      }
    })
    .map((a: any) => {
      const detail = JSON.parse(a.detail);
      return {
        from_username: (a.users as any)?.github_username ?? "?",
        from_id: a.user_id,
        to_username: detail.to_username,
        message: detail.message,
        timestamp: a.created_at,
      };
    });
}
