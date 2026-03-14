import React from "react";
import { Box, Text } from "ink";
import { claude } from "../theme.js";
import type { PresenceState } from "../../shared/types.js";

interface Props {
  members: PresenceState[];
  title?: string;
}

export function FriendsTab({ members, title = "Squad" }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={claude.accent} paddingX={1}>
      <Text bold color={claude.accent}>
        ✦ {title}
        <Text color={claude.cloudy}> ({members.length})</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {members.length === 0 ? (
          <Text color={claude.dim} italic>
            nobody here yet...
          </Text>
        ) : (
          members.map((m, i) => (
            <Box key={i} gap={1}>
              <Text color={claude.online}>●</Text>
              <Text bold color={claude.pampas}>
                {m.github_username}
              </Text>
              {m.status !== "online" && (
                <Text color={claude.cloudy}>— {m.status}</Text>
              )}
              {m.current_file && (
                <Text color={claude.warm} italic>
                  ({m.current_file})
                </Text>
              )}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
