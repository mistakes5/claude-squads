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
  wave:    { sprite: "idle_happy",       frameCount: 6, fps: 3, description: "waving hello",   icon: "\u{1F44B}", label: "Wave" },
  alert:   { sprite: "waiting_neutral",  frameCount: 6, fps: 3, description: "heads up!",      icon: "\u{1F6A8}", label: "Alert" },
  ship:    { sprite: "compacting_happy", frameCount: 5, fps: 6, description: "shipping it!",   icon: "\u{1F680}", label: "Ship" },
  vibe:    { sprite: "idle_happy",       frameCount: 6, fps: 3, description: "vibing",         icon: "\u{1F3B5}", label: "Vibe" },
  think:   { sprite: "working_happy",    frameCount: 6, fps: 4, description: "thinking hard",  icon: "\u{1F914}", label: "Think" },
  sleep:   { sprite: "sleeping_neutral", frameCount: 6, fps: 2, description: "sleeping",       icon: "\u{1F634}", label: "Sleep" },
  sad:     { sprite: "working_sad",      frameCount: 6, fps: 4, description: "feeling sad",    icon: "\u{1F622}", label: "Sad" },
  chillin: { sprite: "idle_neutral",     frameCount: 6, fps: 3, description: "just chillin",   icon: "\u{1F60E}", label: "Chillin" },
  sob:     { sprite: "idle_sob",         frameCount: 6, fps: 3, description: "sobbing",        icon: "\u{1F62D}", label: "Sob" },
};
