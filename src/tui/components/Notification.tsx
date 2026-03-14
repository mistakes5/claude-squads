import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { claude } from "../theme.js";

interface NotificationData {
  id: string;
  message: string;
  type: "info" | "message" | "join" | "activity";
}

interface Props {
  notification: NotificationData | null;
}

const COLORS: Record<string, string> = {
  info: claude.info,
  message: claude.peach,
  join: claude.online,
  activity: claude.warm,
};

export function Notification({ notification }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification?.id]);

  if (!visible || !notification) return null;

  const color = COLORS[notification.type] ?? claude.accent;

  return (
    <Box
      borderStyle="double"
      borderColor={color}
      paddingX={2}
      paddingY={0}
      marginBottom={1}
    >
      <Text color={claude.accent} bold>✦ </Text>
      <Text color={color}>{notification.message}</Text>
    </Box>
  );
}
