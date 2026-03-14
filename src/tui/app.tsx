import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claude } from "./theme.js";

import { StatusBar } from "./components/StatusBar.js";
import { FriendsTab } from "./components/FriendsTab.js";
import { Chat } from "./components/Chat.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { RoomList } from "./components/RoomList.js";
import { Notification } from "./components/Notification.js";
import { EmoteDisplay } from "./components/EmoteDisplay.js";

import { usePresence } from "./hooks/usePresence.js";
import { useMessages } from "./hooks/useMessages.js";
import { useActivity } from "./hooks/useActivity.js";
import { usePings } from "./hooks/usePings.js";

import type { Room, OverlayMode, StoredToken } from "../shared/types.js";

type Panel = "friends" | "chat" | "rooms";

interface Props {
  supabase: SupabaseClient;
  token: StoredToken;
  initialMode: OverlayMode;
}

export function App({ supabase, token, initialMode }: Props) {
  const { exit } = useApp();

  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<(Room & { member_count?: number })[]>([]);
  const [activePanel, setActivePanel] = useState<Panel>("friends");
  const [roomIndex, setRoomIndex] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(initialMode === "always");
  const [mode] = useState<OverlayMode>(initialMode);
  const [notification, setNotification] = useState<any>(null);
  const [activeEmote, setActiveEmote] = useState<any>(null);

  // Hooks
  const { members, updatePresence, channel } = usePresence(
    supabase,
    currentRoom?.slug ?? null,
    token.user.id
  );
  const { messages, sendMessage } = useMessages(
    supabase,
    currentRoom?.id ?? null
  );
  const { activities } = useActivity(channel);
  const { latestPing } = usePings(supabase, token.user.id);

  // Set username in presence when we join
  useEffect(() => {
    if (currentRoom) {
      updatePresence({
        github_username: token.user.github_username,
        avatar_url: token.user.avatar_url,
        status: "online",
      });
    }
  }, [currentRoom?.slug]);

  // Fetch rooms on mount
  useEffect(() => {
    supabase
      .from("rooms")
      .select("*, room_members(count)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          setRooms(
            data.map((r: any) => ({
              ...r,
              member_count: r.room_members?.[0]?.count ?? 0,
            }))
          );
        }
      });
  }, []);

  // Show notifications for new messages in notification mode
  useEffect(() => {
    if (mode === "notifications" && messages.length > 0) {
      const last = messages[messages.length - 1];
      const username = (last.users as any)?.github_username ?? "Someone";
      setNotification({
        id: last.id,
        message: `${username}: ${last.content}`,
        type: "message" as const,
      });
      setOverlayVisible(true);
      const timer = setTimeout(() => setOverlayVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Show ping notifications (always, even in hidden mode)
  useEffect(() => {
    if (latestPing) {
      setNotification({
        id: `ping-${latestPing.timestamp}`,
        message: `🏓 ${latestPing.from_username}: ${latestPing.message}`,
        type: "info" as const,
      });
      // Force overlay visible for pings
      setOverlayVisible(true);
    }
  }, [latestPing]);

  // Handle emote broadcasts from the room channel — play animation
  useEffect(() => {
    if (!channel) return;

    const handler = ({ payload }: { payload: any }) => {
      if (payload.frames) {
        setActiveEmote(payload);
      } else {
        setNotification({
          id: `emote-${payload.timestamp}`,
          message: `${payload.github_username} ${payload.emote}`,
          type: "activity" as const,
        });
      }
      setOverlayVisible(true);
    };

    channel.on("broadcast", { event: "emote" }, handler);

    // Cleanup: channel lifecycle is managed by usePresence,
    // but we track the handler ref to avoid stacking listeners
    return () => {
      // Supabase JS v2 removes listeners when channel is unsubscribed
      // No explicit .off() needed since usePresence unsubscribes the channel
    };
  }, [channel]);

  const joinRoom = useCallback(
    async (slug: string) => {
      const { data: room } = await supabase
        .from("rooms")
        .select()
        .eq("slug", slug)
        .single();

      if (room) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("room_members")
            .upsert({ room_id: room.id, user_id: user.id });
        }
        setCurrentRoom(room);
        setActivePanel("friends");
      }
    },
    [supabase]
  );

  // Keyboard navigation
  useInput((input, key) => {
    // Toggle overlay
    if (input === "s" && key.ctrl) {
      setOverlayVisible((v) => !v);
      return;
    }

    // Quit
    if (input === "q" && key.ctrl) {
      exit();
      return;
    }

    // Tab between panels
    if (key.tab) {
      setActivePanel((p) => {
        if (p === "friends") return "chat";
        if (p === "chat") return "rooms";
        return "friends";
      });
      return;
    }

    // Room list navigation (when rooms panel is active)
    if (activePanel === "rooms") {
      if (key.upArrow) {
        setRoomIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setRoomIndex((i) => Math.min(rooms.length - 1, i + 1));
      } else if (key.return && rooms[roomIndex]) {
        joinRoom(rooms[roomIndex].slug);
      }
    }
  });

  // In notification mode, only show the notification popup
  if (mode === "notifications" && !overlayVisible) {
    return null;
  }

  // Toggle mode: hidden state
  if (mode === "toggle" && !overlayVisible) {
    return (
      <Box paddingX={1}>
        <Text color={claude.dim}>
          squads hidden — press Ctrl+S to show
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      <Notification notification={notification} />
      <EmoteDisplay emote={activeEmote} />

      <StatusBar
        username={token.user.github_username}
        roomName={currentRoom?.name ?? null}
        onlineCount={members.length}
      />

      <Box flexDirection="row" minHeight={15}>
        {/* Left: Friends + Activity */}
        <Box flexDirection="column" width="40%">
          <FriendsTab
            members={members}
            title={currentRoom?.name ?? "Squad"}
          />
          <ActivityFeed activities={activities} />
        </Box>

        {/* Right: Chat or Room List */}
        <Box flexDirection="column" width="60%">
          {activePanel === "rooms" ? (
            <RoomList
              rooms={rooms}
              currentSlug={currentRoom?.slug ?? null}
              onSelect={joinRoom}
              selectedIndex={roomIndex}
            />
          ) : (
            <Chat
              messages={messages}
              onSend={sendMessage}
              active={activePanel === "chat"}
            />
          )}
        </Box>
      </Box>

      <Box paddingX={1}>
        <Text color={claude.dim}>
          tab: switch panels | ctrl+s: toggle | ctrl+q: quit
          {activePanel === "rooms" ? " | ↑↓: navigate | enter: join" : ""}
        </Text>
      </Box>
    </Box>
  );
}
