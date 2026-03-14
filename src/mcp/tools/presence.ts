import { getSupabase } from "../../shared/supabase.js";
import { loadToken } from "../../shared/config.js";
import type { PresenceState } from "../../shared/types.js";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Track active room channels
const activeChannels = new Map<string, RealtimeChannel>();

export async function trackPresence(
  roomSlug: string,
  status: string = "online"
): Promise<void> {
  const supabase = getSupabase();
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  // Clean up existing channel for this room
  if (activeChannels.has(roomSlug)) {
    await activeChannels.get(roomSlug)!.unsubscribe();
  }

  const channel = supabase.channel(`room:${roomSlug}`, {
    config: { presence: { key: token.user.id } },
  });

  channel.subscribe(async (status_) => {
    if (status_ === "SUBSCRIBED") {
      await channel.track({
        github_username: token.user.github_username,
        avatar_url: token.user.avatar_url,
        status,
        current_file: null,
        online_at: new Date().toISOString(),
      } satisfies PresenceState);
    }
  });

  activeChannels.set(roomSlug, channel);
}

export async function updateStatus(
  roomSlug: string,
  status: string,
  currentFile?: string
): Promise<void> {
  const channel = activeChannels.get(roomSlug);
  if (!channel) throw new Error(`Not in room "${roomSlug}"`);

  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  await channel.track({
    github_username: token.user.github_username,
    avatar_url: token.user.avatar_url,
    status,
    current_file: currentFile ?? null,
    online_at: new Date().toISOString(),
  } satisfies PresenceState);
}

export function getPresence(roomSlug: string): PresenceState[] {
  const channel = activeChannels.get(roomSlug);
  if (!channel) return [];

  const state = channel.presenceState<PresenceState>();
  return Object.values(state).flatMap((presences) => presences);
}

export async function untrackPresence(roomSlug: string): Promise<void> {
  const channel = activeChannels.get(roomSlug);
  if (channel) {
    await channel.untrack();
    await channel.unsubscribe();
    activeChannels.delete(roomSlug);
  }
}

export function getActiveChannels(): Map<string, RealtimeChannel> {
  return activeChannels;
}
