import { getSupabase } from "../../shared/supabase.js";
import { loadToken } from "../../shared/config.js";
import type { Message } from "../../shared/types.js";

/**
 * Send a message via Supabase Realtime Broadcast (ephemeral, not stored in DB).
 * The watcher picks it up and saves to local state.json.
 */
export async function sendMessage(
  roomSlug: string,
  content: string
): Promise<{ username: string; content: string }> {
  const supabase = getSupabase();
  const token = loadToken();
  const username = token?.user?.github_username ?? "unknown";

  const channel = supabase.channel(`room:${roomSlug}`);

  await channel.subscribe();
  await channel.send({
    type: "broadcast",
    event: "new_message",
    payload: {
      username,
      content,
      created_at: new Date().toISOString(),
    },
  });

  // Clean up channel after sending
  await channel.unsubscribe();

  return { username, content };
}

/**
 * Get recent messages from local state (no DB query).
 * Messages are ephemeral — only what the watcher has captured.
 */
export async function getMessages(
  _roomSlug: string,
  _limit: number = 20
): Promise<Message[]> {
  // Read from local state file instead of DB
  const { readFileSync, existsSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");

  const stateFile = join(homedir(), ".squads", "state.json");
  if (!existsSync(stateFile)) return [];

  try {
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    return (state.recent_messages ?? []).map((m: any) => ({
      id: "",
      room_id: "",
      user_id: "",
      content: m.content,
      created_at: m.created_at,
      users: { github_username: m.username },
    }));
  } catch {
    return [];
  }
}
