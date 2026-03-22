import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { claude } from "../theme.js";

export interface EmotePayload {
  github_username: string;
  emote_name: string;
  frames: string[];   // each string is one frame of ASCII art
  frameMs: number;    // ms between frames
  timestamp: string;  // used to detect new emotes
}

interface Props {
  emote: EmotePayload | null;
}

/**
 * Animated emote display — Clash Royale style.
 *
 * Plays through frames sequentially with the specified timing,
 * then holds the last frame for a beat before fading out.
 */
export function EmoteDisplay({ emote }: Props) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [visible, setVisible] = useState(false);
  const [activeEmote, setActiveEmote] = useState<EmotePayload | null>(null);

  useEffect(() => {
    if (!emote) return;

    // New emote arrived — start animation
    setActiveEmote(emote);
    setCurrentFrame(0);
    setVisible(true);
  }, [emote?.timestamp]);

  // Animate through frames
  useEffect(() => {
    if (!activeEmote || !visible) return;

    if (currentFrame < activeEmote.frames.length - 1) {
      const timer = setTimeout(() => {
        setCurrentFrame((f) => f + 1);
      }, activeEmote.frameMs);
      return () => clearTimeout(timer);
    } else {
      // Hold last frame, then fade
      const timer = setTimeout(() => {
        setVisible(false);
        setActiveEmote(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentFrame, activeEmote, visible]);

  if (!visible || !activeEmote) return null;

  const frame = activeEmote.frames[currentFrame] ?? "";

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={claude.peach}
      paddingX={2}
      paddingY={0}
      marginY={1}
      alignSelf="center"
    >
      <Text color={claude.peach} bold>
        {activeEmote.github_username}
      </Text>
      <Text color={claude.pampas}>{frame}</Text>
    </Box>
  );
}
