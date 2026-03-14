import { useState, useEffect } from "react";
import type { Socket } from "socket.io-client";

interface ActivityEvent {
  github_username: string;
  action: string;
  detail: string | null;
  timestamp: string;
}

export function useActivity(socket: Socket | null) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handler = (payload: any) => {
      setActivities((prev) => [
        ...prev.slice(-49),
        {
          github_username: payload.username || payload.github_username,
          action: payload.action,
          detail: payload.detail || null,
          timestamp: payload.timestamp || new Date().toISOString(),
        },
      ]);
    };

    socket.on("activity", handler);

    return () => {
      socket.off("activity", handler);
    };
  }, [socket]);

  return { activities };
}
