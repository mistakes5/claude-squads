import { useState, useEffect, useCallback, useRef } from "react";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { PresenceState } from "../../shared/types.js";

export function usePresence(supabase: SupabaseClient, roomSlug: string | null, userId: string) {
  const [members, setMembers] = useState<PresenceState[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!roomSlug) {
      setChannel(null);
      channelRef.current = null;
      return;
    }

    const ch = supabase.channel(`room:${roomSlug}`, {
      config: { presence: { key: userId } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresenceState>();
      const all = Object.values(state).flatMap((p) => p);
      setMembers(all);
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({
          github_username: "",
          avatar_url: null,
          status: "online",
          current_file: null,
          online_at: new Date().toISOString(),
        } satisfies PresenceState);
      }
    });

    setChannel(ch);
    channelRef.current = ch;

    return () => {
      ch.untrack();
      ch.unsubscribe();
      channelRef.current = null;
    };
  }, [roomSlug, userId]);

  const updatePresence = useCallback(async (state: Partial<PresenceState>) => {
    const ch = channelRef.current;
    if (!ch) return;

    await ch.track({
      github_username: "",
      avatar_url: null,
      status: "online",
      current_file: null,
      online_at: new Date().toISOString(),
      ...state,
    } as PresenceState);
  }, []);

  return { members, updatePresence, channel };
}
