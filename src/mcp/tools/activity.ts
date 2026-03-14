import { getSupabase } from "../../shared/supabase.js";
import { loadToken } from "../../shared/config.js";
import { getActiveChannels } from "./presence.js";
import type { Activity } from "../../shared/types.js";

/**
 * Post an activity update. Uses Broadcast for real-time (ephemeral)
 * and optionally persists to the activities table.
 */
export async function postActivity(
  roomSlug: string,
  action: string,
  detail?: string,
  persist: boolean = false
): Promise<void> {
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  // Broadcast ephemeral activity to all room members
  const channel = getActiveChannels().get(roomSlug);
  if (channel) {
    await channel.send({
      type: "broadcast",
      event: "activity",
      payload: {
        github_username: token.user.github_username,
        action,
        detail: detail ?? null,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Optionally persist to DB
  if (persist) {
    const supabase = getSupabase();
    const { data: room } = await supabase
      .from("rooms")
      .select("id")
      .eq("slug", roomSlug)
      .single();

    if (room) {
      await supabase
        .from("activities")
        .insert({
          room_id: room.id,
          user_id: token.user.id,
          action,
          detail: detail ?? null,
        });
    }
  }
}

/**
 * Get persistent activity history for a room.
 */
export async function getActivityHistory(
  roomSlug: string,
  limit: number = 20
): Promise<Activity[]> {
  const supabase = getSupabase();

  const { data: room } = await supabase
    .from("rooms")
    .select("id")
    .eq("slug", roomSlug)
    .single();

  if (!room) throw new Error(`Room "${roomSlug}" not found`);

  const { data, error } = await supabase
    .from("activities")
    .select("*, users(*)")
    .eq("room_id", room.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get activities: ${error.message}`);
  return (data ?? []).reverse();
}
