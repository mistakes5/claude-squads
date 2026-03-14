import React from "react";
import { Box, Text } from "ink";
import { claude } from "../theme.js";

interface Props {
  username: string;
  roomName: string | null;
  onlineCount: number;
}

export function StatusBar({ username, roomName, onlineCount }: Props) {
  return (
    <Box
      borderStyle="single"
      borderColor={claude.accent}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text>
        <Text color={claude.accent} bold>
          ✦ SQUADS
        </Text>
        <Text color={claude.dim}> │ </Text>
        <Text color={claude.pampas}>{username}</Text>
      </Text>
      <Text>
        {roomName ? (
          <>
            <Text color={claude.peach}>{roomName}</Text>
            <Text color={claude.dim}> │ </Text>
            <Text color={claude.online}>{onlineCount}</Text>
            <Text color={claude.cloudy}> online</Text>
          </>
        ) : (
          <Text color={claude.cloudy} italic>
            no room
          </Text>
        )}
      </Text>
    </Box>
  );
}
