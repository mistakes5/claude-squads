import { useState, useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exec } from "child_process";
import { platform } from "os";

interface PingEvent {
  from_username: string;
  from_id: string;
  to_username: string;
  message: string;
  timestamp: string;
}

/**
 * Listen for pings on the user's personal channel.
 * When a ping arrives:
 *   1. Show it in the TUI notification
 *   2. Fire a system notification (macOS/Linux) so they notice even if terminal is hidden
 */
export function usePings(supabase: SupabaseClient, userId: string) {
  const [latestPing, setLatestPing] = useState<PingEvent | null>(null);
  const [pingCount, setPingCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`user:${userId}`);

    channel.on("broadcast", { event: "ping" }, ({ payload }) => {
      const ping = payload as PingEvent;
      setLatestPing(ping);
      setPingCount((c) => c + 1);

      // Fire system notification
      sendSystemNotification(
        `🏓 ${ping.from_username}`,
        ping.message
      );
    });

    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  return { latestPing, pingCount };
}

/**
 * Send a native OS notification.
 * macOS: osascript
 * Linux: notify-send
 */
function sendSystemNotification(title: string, body: string) {
  const os = platform();
  const safeTitle = title.replace(/"/g, '\\"');
  const safeBody = body.replace(/"/g, '\\"');

  if (os === "darwin") {
    exec(
      `osascript -e 'display notification "${safeBody}" with title "${safeTitle}"'`
    );
  } else if (os === "linux") {
    exec(`notify-send "${safeTitle}" "${safeBody}"`);
  }
  // Windows: could use PowerShell toast, but skipping for now
}
