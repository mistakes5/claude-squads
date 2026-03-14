import React from "react";
import { Box, Text } from "ink";
import { claude } from "../theme.js";
import type { Room } from "../../shared/types.js";

interface RoomWithCount extends Room {
  member_count?: number;
}

interface Props {
  rooms: RoomWithCount[];
  currentSlug: string | null;
  onSelect: (slug: string) => void;
  selectedIndex: number;
}

export function RoomList({ rooms, currentSlug, selectedIndex }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={claude.border} paddingX={1}>
      <Text bold color={claude.accent}>
        ✦ Rooms
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {rooms.length === 0 ? (
          <Text color={claude.dim} italic>
            no rooms yet
          </Text>
        ) : (
          rooms.map((r, i) => {
            const isSelected = i === selectedIndex;
            const isCurrent = r.slug === currentSlug;
            return (
              <Box key={r.id} gap={1}>
                <Text color={isSelected ? claude.accent : claude.dim}>
                  {isSelected ? "▸" : " "}
                </Text>
                <Text bold={isCurrent} color={isCurrent ? claude.online : claude.pampas}>
                  {r.name}
                </Text>
                {r.member_count !== undefined && (
                  <Text color={claude.cloudy}>({r.member_count})</Text>
                )}
                {isCurrent && <Text color={claude.online}> ✓</Text>}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
