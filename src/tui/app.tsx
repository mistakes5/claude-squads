import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { Socket } from "socket.io-client";
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

import { apiFetch } from "../shared/api-client.js";
import { EMOTES } from "../mcp/tools/emotes.js";
import type { Room, OverlayMode, StoredToken } from "../shared/types.js";

type Panel = "friends" | "chat" | "rooms";

interface Props {
  socket: Socket;
  token: StoredToken;
  initialMode: OverlayMode;
}

export function App({ socket, token, initialMode }: Props) {
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
  const { members, updatePresence } = usePresence(
    socket,
    currentRoom?.slug ?? null,
    token.user.id
  );
  const { messages, sendMessage } = useMessages(
    socket,
    currentRoom?.slug ?? null
  );
  const { activities } = useActivity(socket);
  const { latestPing } = usePings(socket, token.user.id);

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

  // Fetch rooms on mount via REST
  useEffect(() => {
    apiFetch("/api/rooms")
      .then((data) => {
        if (data) setRooms(data);
      })
      .catch((err) => console.error("Failed to fetch rooms:", err.message));
  }, []);

  // Show notifications for new messages in notification mode
  // Track previous count to distinguish bulk fetches from single new messages
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const current = messages.length;
    prevMessageCountRef.current = current;

    // Only notify for single incremental messages, not initial bulk load
    if (mode === "notifications" && current > prev && current - prev === 1) {
      const last = messages[current - 1];
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
      setOverlayVisible(true);
    }
  }, [latestPing]);

  // Resolve emote payload from name → ASCII art frames
  const resolveEmote = useCallback((username: string, emoteName: string) => {
    const emoteDef = EMOTES[emoteName];
    if (emoteDef) {
      setActiveEmote({
        github_username: username,
        emote_name: emoteName,
        frames: emoteDef.frames.map((f) => f.art),
        frameMs: emoteDef.frameMs,
        timestamp: new Date().toISOString(),
      });
    } else {
      setNotification({
        id: `emote-${Date.now()}`,
        message: `${username} sent :${emoteName}:`,
        type: "activity" as const,
      });
    }
    setOverlayVisible(true);
  }, []);

  // Handle emote broadcasts from Socket.io (room emotes + friend emotes)
  useEffect(() => {
    if (!socket) return;

    const handleRoomEmote = (payload: any) => {
      resolveEmote(payload.username, payload.emote);
    };

    const handleFriendEmote = (payload: any) => {
      resolveEmote(payload.fromUsername, payload.emote);
    };

    socket.on("emote", handleRoomEmote);
    socket.on("friend-emote", handleFriendEmote);

    return () => {
      socket.off("emote", handleRoomEmote);
      socket.off("friend-emote", handleFriendEmote);
    };
  }, [socket, resolveEmote]);

  const joinRoom = useCallback(
    async (slug: string) => {
      try {
        await apiFetch(`/api/rooms/${encodeURIComponent(slug)}/join`, {
          method: "POST",
        });
        const room = await apiFetch(`/api/rooms/${encodeURIComponent(slug)}`);
        if (room) {
          setCurrentRoom(room);
          setActivePanel("friends");
        }
      } catch (err: any) {
        console.error("Failed to join room:", err.message);
      }
    },
    []
  );

  // Keyboard navigation
  useInput((input, key) => {
    if (input === "s" && key.ctrl) {
      setOverlayVisible((v) => !v);
      return;
    }

    if (input === "q" && key.ctrl) {
      exit();
      return;
    }

    if (key.tab) {
      setActivePanel((p) => {
        if (p === "friends") return "chat";
        if (p === "chat") return "rooms";
        return "friends";
      });
      return;
    }

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

  if (mode === "notifications" && !overlayVisible) {
    return null;
  }

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
        <Box flexDirection="column" width="40%">
          <FriendsTab
            members={members}
            title={currentRoom?.name ?? "Squad"}
          />
          <ActivityFeed activities={activities} />
        </Box>

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
