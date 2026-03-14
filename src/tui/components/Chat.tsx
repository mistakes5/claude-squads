import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { claude } from "../theme.js";
import type { Message } from "../../shared/types.js";

interface Props {
  messages: Message[];
  onSend: (content: string) => void;
  active: boolean;
}

export function Chat({ messages, onSend, active }: Props) {
  const [input, setInput] = useState("");

  const handleSubmit = (value: string) => {
    if (value.trim()) {
      onSend(value.trim());
      setInput("");
    }
  };

  const displayMessages = messages.slice(-15);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={active ? claude.accent : claude.borderDim}
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color={claude.accent}>
        ✦ Chat
      </Text>
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {displayMessages.length === 0 ? (
          <Text color={claude.dim} italic>
            no messages yet. say hi!
          </Text>
        ) : (
          displayMessages.map((m, i) => {
            const time = new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const username = (m.users as any)?.github_username ?? "?";
            return (
              <Box key={i} gap={1}>
                <Text color={claude.dim}>{time}</Text>
                <Text bold color={claude.peach}>
                  {username}
                </Text>
                <Text color={claude.cream}>{m.content}</Text>
              </Box>
            );
          })
        )}
      </Box>
      {active && (
        <Box marginTop={1}>
          <Text color={claude.accent}>{"❯"} </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="type a message..."
          />
        </Box>
      )}
    </Box>
  );
}
