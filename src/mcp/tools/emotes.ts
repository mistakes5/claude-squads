import { loadToken } from "../../shared/config.js";
import { getSocket, getJoinedRooms } from "./_socket.js";

/**
 * Claude-themed animated emotes — Clash Royale style.
 *
 * Each emote has animation frames that play in sequence.
 * Frame timing is ~150ms per frame for that snappy CR feel.
 * The last frame holds as the "resting" state.
 */

interface EmoteFrame {
  art: string;
}

interface AnimatedEmote {
  frames: EmoteFrame[];
  description: string;
  frameMs: number; // ms per frame
}

export const EMOTES: Record<string, AnimatedEmote> = {
  // ── clawd-wave: bounces in, then waves ──────────────────
  "clawd-wave": {
    frameMs: 140,
    description: "clawd waving hello",
    frames: [
      { art: "      \n   ·  \n      " },
      { art: "   ╭╮ \n   ╰╯ \n      " },
      {
        art: [
          "  ╭━━━╮  ",
          "  ┃ ◠◠┃  ",
          "  ┃ ‿ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮ ╱",
          "  ┃ ◠◠┃╱ ",
          "  ┃ ‿ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮──",
          "  ┃ ◠◠┃  ",
          "  ┃ ‿ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮ ╱",
          "  ┃ ◠◠┃╱ ",
          "  ┃ ◡ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮──",
          "  ┃ ◠◠┃  ",
          "  ┃ ◡ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮  ",
          "  ┃ ◠◠┃  ",
          "  ┃ ◡ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
    ],
  },

  "clawd-think": {
    frameMs: 180,
    description: "clawd thinking hard",
    frames: [
      { art: "      \n   ·  \n      " },
      { art: "   ╭╮ \n   ╰╯ \n      " },
      {
        art: [
          "  ╭━━━╮  ",
          "  ┃ ◉◉┃  ",
          "  ┃ ━ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮  ",
          "  ┃ ◉◉┃  ",
          "  ┃ ━ ┃ ·",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮ ·",
          "  ┃ ◉◉┃○ ",
          "  ┃ ━ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮○ ",
          "  ┃ ◉◉┃◯ ",
          "  ┃ ━ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
      {
        art: [
          "  ╭━━━╮💭",
          "  ┃ ◉◉┃○ ",
          "  ┃ ▿ ┃  ",
          "  ╰━━━╯  ",
        ].join("\n"),
      },
    ],
  },

  "clawd-ship": {
    frameMs: 120,
    description: "clawd shipping it",
    frames: [
      { art: "      \n   ·  \n      " },
      { art: "   ╭╮ \n   ╰╯ \n      " },
      { art: ["  ╭━━━╮  ", "  ┃ ▸▸┃  ", "  ┃ ▽ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ▸▸┃🚀", "  ┃ ▽ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮🚀", "  ┃ ▸▸┃  ", "  ┃ △ ┃  ", "  ╰━━━╯💨"].join("\n") },
      { art: [" 🚀━━━╮  ", "  ┃ ⊙⊙┃  ", "  ┃ ◡ ┃  ", "  ╰━━━╯💨"].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ◡ ┃  ", "  ╰━━━╯✨"].join("\n") },
    ],
  },

  "clawd-vibe": {
    frameMs: 200,
    description: "clawd vibing",
    frames: [
      { art: "      \n   ·  \n      " },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ◡ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: [" ╭━━━╮ ♪ ", " ┃ ◠◠┃   ", " ┃ ◡ ┃   ", " ╰━━━╯   "].join("\n") },
      { art: ["   ╭━━━╮ ", "   ┃ ◠◠┃ ", "   ┃ ◡ ┃ ", "   ╰━━━╯ "].join("\n") },
      { art: [" ♫╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ◡ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: [" ╭━━━╮ ♪ ", " ┃ ◠◠┃   ", " ┃ ◡ ┃   ", " ╰━━━╯   "].join("\n") },
      { art: ["  ╭━━━╮♪ ", " ♫┃ ◠◠┃  ", "  ┃ ◡ ┃  ", "  ╰━━━╯  "].join("\n") },
    ],
  },

  "clawd-fire": {
    frameMs: 130,
    description: "clawd on fire",
    frames: [
      { art: "      \n   ·  \n      " },
      { art: ["  ╭━━━╮  ", "  ┃ ··┃  ", "  ┃   ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ◉◉┃  ", "  ┃ △ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ⊙⊙┃🔥", "  ┃ △ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: [" 🔥╭━━━╮ ", "  ┃ ⊙⊙┃🔥", "  ┃ ◡ ┃  ", " 🔥╰━━━╯ "].join("\n") },
      { art: ["🔥╭━━━╮🔥", "  ┃ ⊙⊙┃  ", " 🔥 ◡ 🔥 ", "  ╰━━━╯  "].join("\n") },
    ],
  },

  "clawd-sleep": {
    frameMs: 300,
    description: "clawd sleeping",
    frames: [
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ‿ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ──┃  ", "  ┃ ‿ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ━━┃  ", "  ┃ ‿ ┃z ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮ z", "  ┃ ━━┃z ", "  ┃ ‿ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮zZ", "  ┃ ━━┃  ", "  ┃ ‿ ┃  ", "  ╰━━━╯  "].join("\n") },
    ],
  },

  "clawd-bug": {
    frameMs: 160,
    description: "clawd found a bug",
    frames: [
      { art: "      \n   ·  \n      " },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ‿ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ‿ ┃ ·", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮! ", "  ┃ ⊗⊗┃  ", "  ┃ △ ┃🪲 ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ⊗⊗┃  ", "  ┃ ▿ ┃🪲 ", "  ╰━━━╯  "].join("\n") },
    ],
  },

  "clawd-lgtm": {
    frameMs: 140,
    description: "clawd approves",
    frames: [
      { art: "      \n   ·  \n      " },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ‿ ┃  ", "  ╰━━━╯  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ◡ ┃  ", "  ╰━┳━╯  ", "    ┃    "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ◡ ┃  ", "  ╰━┳━╯  ", "    ┃👍  "].join("\n") },
      { art: ["  ╭━━━╮  ", "  ┃ ◠◠┃  ", "  ┃ ◡ ┃  ", "  ╰━┳━╯✨", "   ✨👍  "].join("\n") },
    ],
  },

  gg: {
    frameMs: 140,
    description: "good game",
    frames: [
      { art: "  · " },
      { art: "  ╔═╗╔═╗\n  ║  ║   \n  ╚═╝╚═╝" },
      { art: "  ╔═╗╔═╗\n  ║ ╦║ ╦ \n  ╚═╝╚═╝" },
      { art: " ✨╔═╗╔═╗✨\n   ║ ╦║ ╦ \n   ╚═╝╚═╝" },
    ],
  },
  ship: {
    frameMs: 100,
    description: "ship it!",
    frames: [
      { art: "  · " },
      { art: "  SHIP " },
      { art: "  SHIP IT " },
      { art: " 🚀 SHIP IT 🚀" },
      { art: "🚀🚀 SHIP IT 🚀🚀" },
      { art: " 🚀 SHIP IT 🚀" },
    ],
  },
  rip: {
    frameMs: 200,
    description: "rest in peace",
    frames: [
      { art: "       " },
      { art: "  ┌───┐\n  │   │\n  └───┘" },
      { art: "  ┌─────┐\n  │ R.I.P│\n  │     │\n  └─────┘" },
      { art: "  ┌─────┐\n  │ R.I.P│\n  │  💀 │\n  └─────┘" },
    ],
  },
};

/**
 * Send an emote to the current room via Socket.io.
 */
export async function sendEmote(
  roomSlug: string,
  emoteName: string
): Promise<string> {
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  const emote = EMOTES[emoteName];
  if (!emote) {
    const available = Object.keys(EMOTES).join(", ");
    throw new Error(`Unknown emote "${emoteName}". Available: ${available}`);
  }

  if (!getJoinedRooms().has(roomSlug)) {
    throw new Error(`Not in room "${roomSlug}". Join first.`);
  }

  const socket = getSocket();
  socket.emit("send-emote", {
    slug: roomSlug,
    emote: emoteName,
  });

  const lastFrame = emote.frames[emote.frames.length - 1];
  return `${lastFrame.art}\n(${emote.description})`;
}

/**
 * List all available emotes.
 */
export function listEmotes(): string {
  const lines = Object.entries(EMOTES).map(
    ([name, e]) => {
      const lastFrame = e.frames[e.frames.length - 1];
      return `  :${name}: — ${e.description}\n${lastFrame.art}`;
    }
  );
  return `Available emotes:\n\n${lines.join("\n\n")}`;
}
