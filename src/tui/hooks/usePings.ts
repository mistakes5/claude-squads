import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";
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
 * Listen for pings via Socket.io on the user's personal room.
 * When a ping arrives:
 *   1. Show it in the TUI notification
 *   2. Fire a system notification (macOS/Linux) so they notice even if terminal is hidden
 */
export function usePings(socket: Socket, _userId: string) {
  const [latestPing, setLatestPing] = useState<PingEvent | null>(null);
  const [pingCount, setPingCount] = useState(0);

  useEffect(() => {
    if (!socket) return;

    const handler = (payload: any) => {
      const ping: PingEvent = {
        from_username: payload.from_username,
        from_id: payload.from || "",
        to_username: "",
        message: payload.message,
        timestamp: payload.timestamp || new Date().toISOString(),
      };
      setLatestPing(ping);
      setPingCount((c) => c + 1);

      sendSystemNotification(
        `🏓 ${ping.from_username}`,
        ping.message
      );
    };

    socket.on("ping", handler);

    return () => {
      socket.off("ping", handler);
    };
  }, [socket]);

  return { latestPing, pingCount };
}

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
}
