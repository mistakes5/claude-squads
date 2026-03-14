/**
 * Gamification Plugin Interface
 *
 * The gamification computation (XP formula, tier thresholds, achievement rules,
 * GitHub stats fetching) is implemented as a plugin so it can be kept as a
 * separate closed-source package while the rest of the app remains open source.
 *
 * Without the plugin installed, all users default to "bronze" tier and no
 * achievements are awarded. Read-only endpoints still work (they query the DB).
 */

export interface GamificationPlugin {
  /** Fetch GitHub stats, compute XP/tier, upsert DB, return result */
  refreshUserStats(userId: string): Promise<{
    xp: number;
    tier: string;
    achievements: string[];
  } | null>;

  /** Start the periodic background refresh scheduler */
  startScheduler(): void;

  /** Stop the scheduler (cleanup) */
  stopScheduler(): void;
}

let plugin: GamificationPlugin | null = null;

export function registerGamificationPlugin(p: GamificationPlugin) {
  plugin = p;
}

export function getGamificationPlugin(): GamificationPlugin | null {
  return plugin;
}
