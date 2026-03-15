/**
 * Sprite-based emote definitions using notchi pixel art.
 * Each emote maps to a 32x32 sprite sheet (6 frames, or 5 for compacting).
 */

export interface SpriteEmote {
  sprite: string;     // sprite sheet filename (e.g. "idle_happy")
  frameCount: number; // 6 for most, 5 for compacting
  fps: number;
  description: string;
  icon: string;       // emoji for picker UI
  label: string;      // display name
}

export const EMOTES: Record<string, SpriteEmote> = {
  wave:  { sprite: "idle_happy",       frameCount: 6, fps: 3, description: "waving hello",   icon: "\u{1F44B}", label: "Wave" },
  think: { sprite: "waiting_neutral",  frameCount: 6, fps: 3, description: "thinking hard",  icon: "\u{1F914}", label: "Think" },
  ship:  { sprite: "compacting_happy", frameCount: 5, fps: 6, description: "shipping it!",   icon: "\u{1F680}", label: "Ship" },
  vibe:  { sprite: "idle_happy",       frameCount: 6, fps: 3, description: "vibing",         icon: "\u{1F3B5}", label: "Vibe" },
  fire:  { sprite: "working_happy",    frameCount: 6, fps: 4, description: "on fire!",       icon: "\u{1F525}", label: "Fire" },
  sleep: { sprite: "sleeping_neutral", frameCount: 6, fps: 2, description: "sleeping",       icon: "\u{1F634}", label: "Sleep" },
  bug:   { sprite: "working_sad",      frameCount: 6, fps: 4, description: "found a bug",    icon: "\u{1FAB2}", label: "Bug" },
  lgtm:  { sprite: "idle_happy",       frameCount: 6, fps: 3, description: "looks good!",    icon: "\u{1F44D}", label: "LGTM" },
  gg:    { sprite: "idle_neutral",     frameCount: 6, fps: 3, description: "good game",      icon: "\u{1F3AE}", label: "GG" },
  rip:   { sprite: "idle_sob",         frameCount: 6, fps: 3, description: "rest in peace",  icon: "\u{1F480}", label: "RIP" },
  cry:   { sprite: "working_sob",      frameCount: 6, fps: 4, description: "crying",         icon: "\u{1F62D}", label: "Cry" },
};
