import { useState, useEffect, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { PresenceState } from "../../shared/types.js";

export function usePresence(socket: Socket, roomSlug: string | null, _userId: string) {
  const [members, setMembers] = useState<PresenceState[]>([]);

  useEffect(() => {
    if (!roomSlug) {
      setMembers([]);
      return;
    }

    // Join room via Socket.io
    socket.emit("join-room", { slug: roomSlug });

    const handlePresenceSync = ({ slug, members: m }: { slug: string; members: any[] }) => {
      if (slug !== roomSlug) return;
      setMembers(
        m.map((p) => ({
          github_username: p.username,
          avatar_url: p.avatar_url || null,
          status: p.status || "online",
          current_file: p.current_file || null,
          online_at: new Date().toISOString(),
        }))
      );
    };

    socket.on("room-presence-sync", handlePresenceSync);

    return () => {
      socket.emit("leave-room", { slug: roomSlug });
      socket.off("room-presence-sync", handlePresenceSync);
    };
  }, [roomSlug, socket]);

  const updatePresence = useCallback(
    (state: Partial<PresenceState>) => {
      if (!roomSlug) return;
      socket.emit("set-status", {
        slug: roomSlug,
        status: state.status,
        currentFile: state.current_file,
      });
    },
    [roomSlug, socket]
  );

  return { members, updatePresence, socket };
}
