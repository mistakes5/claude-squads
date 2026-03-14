import { useState, useEffect, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { Message } from "../../shared/types.js";
import { apiFetch } from "../../shared/api-client.js";

export function useMessages(socket: Socket, roomSlug: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);

  // Fetch initial messages via REST
  useEffect(() => {
    if (!roomSlug) return;

    apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/messages`)
      .then((data) => {
        if (data) setMessages(data);
      })
      .catch((err) => console.error("Failed to fetch messages:", err.message));
  }, [roomSlug]);

  // Listen for new messages via Socket.io
  useEffect(() => {
    if (!roomSlug) return;

    const handler = (msg: any) => {
      const message: Message = {
        id: msg.id || `${Date.now()}`,
        room_id: msg.room_id || "",
        user_id: msg.user_id || "",
        content: msg.content,
        created_at: msg.created_at || new Date().toISOString(),
        users: {
          id: msg.user_id || "",
          github_id: "",
          github_username: msg.github_username,
          avatar_url: msg.avatar_url || null,
          created_at: "",
        },
      };
      setMessages((prev) => [...prev.slice(-99), message]);
    };

    socket.on("new-message", handler);

    return () => {
      socket.off("new-message", handler);
    };
  }, [roomSlug, socket]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!roomSlug) return;
      await apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    [roomSlug]
  );

  return { messages, sendMessage };
}
