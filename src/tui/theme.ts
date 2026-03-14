/**
 * Claude-themed color palette for the Squads TUI.
 *
 * Based on Claude's brand colors:
 *   - Crail (terracotta orange): #C15F3C — primary accent
 *   - Peach: #DE7356 — secondary accent / highlights
 *   - Pampas (warm cream): #F4F3EE — light surfaces (used sparingly in dark terminals)
 *   - Cloudy (neutral): #B1ADA1 — muted/secondary text
 *
 * Terminal adaptations:
 *   We use hex colors directly (Ink supports truecolor).
 *   For terminals without truecolor, these degrade gracefully to nearest ANSI.
 */

export const claude = {
  // Primary brand
  accent: "#C15F3C",       // Crail — headings, active borders, key highlights
  peach: "#DE7356",        // Peach — secondary accent, hover states
  warm: "#E8976B",         // Lighter warm — subtle highlights

  // Neutrals
  cloudy: "#B1ADA1",       // Muted text, timestamps, secondary info
  dim: "#6B6560",          // Very muted — disabled, placeholders
  pampas: "#F4F3EE",       // Warm white — primary text on dark bg
  cream: "#E8E4DB",        // Off-white — secondary text

  // Functional
  online: "#5BA37C",       // Green — online indicators
  offline: "#8B7E74",      // Gray-brown — offline indicators
  error: "#C44B4B",        // Red — errors
  info: "#7B9EC4",         // Muted blue — informational

  // Borders
  border: "#4A4440",       // Subtle warm dark border
  borderActive: "#C15F3C", // Active panel border = accent
  borderDim: "#3A3633",    // Inactive borders
} as const;
