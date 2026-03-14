import React from "react";
import { Box, Text } from "ink";
import { claude } from "../theme.js";

interface ActivityEvent {
  github_username: string;
  action: string;
  detail: string | null;
  timestamp: string;
}

interface Props {
  activities: ActivityEvent[];
}

export function ActivityFeed({ activities }: Props) {
  const recent = activities.slice(-8);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={claude.border} paddingX={1}>
      <Text bold color={claude.warm}>
        ✦ Activity
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {recent.length === 0 ? (
          <Text color={claude.dim} italic>
            waiting for action...
          </Text>
        ) : (
          recent.map((a, i) => (
            <Box key={i} gap={1}>
              <Text color={claude.peach}>⚡</Text>
              <Text bold color={claude.pampas}>
                {a.github_username}
              </Text>
              <Text color={claude.cloudy}>
                {a.action}
                {a.detail ? ` ${a.detail}` : ""}
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
