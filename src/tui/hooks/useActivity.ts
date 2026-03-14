import { useState, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface ActivityEvent {
  github_username: string;
  action: string;
  detail: string | null;
  timestamp: string;
}

export function useActivity(channel: RealtimeChannel | null) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const handlerRef = useRef<((args: { payload: unknown }) => void) | null>(null);
  const prevChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Clean up previous listener if channel changed
    if (prevChannelRef.current && handlerRef.current) {
      prevChannelRef.current.unsubscribe();
    }

    if (!channel) {
      prevChannelRef.current = null;
      handlerRef.current = null;
      return;
    }

    const handler = ({ payload }: { payload: unknown }) => {
      setActivities((prev) => [...prev.slice(-49), payload as ActivityEvent]);
    };

    channel.on("broadcast", { event: "activity" }, handler);
    handlerRef.current = handler;
    prevChannelRef.current = channel;

    return () => {
      // Channel cleanup is handled by usePresence which owns the channel lifecycle
      handlerRef.current = null;
    };
  }, [channel]);

  return { activities };
}
