import { useState, useEffect, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "../../shared/types.js";

export function useMessages(supabase: SupabaseClient, roomId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);

  // Fetch initial messages
  useEffect(() => {
    if (!roomId) return;

    supabase
      .from("messages")
      .select("*, users(*)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setMessages(data.reverse());
      });
  }, [roomId]);

  // Subscribe to new messages
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          // Fetch the full message with user data
          const { data } = await supabase
            .from("messages")
            .select("*, users(*)")
            .eq("id", payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => [...prev.slice(-99), data]);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!roomId) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("messages")
        .insert({ room_id: roomId, user_id: user.id, content });
    },
    [roomId]
  );

  return { messages, sendMessage };
}
