import { query } from "../db.js";
import { refreshUserStats } from "./github-stats.js";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STALE_HOURS = 6;
const BATCH_SIZE = 5;

let intervalId: ReturnType<typeof setInterval> | null = null;

async function refreshStaleBatch() {
  try {
    const result = await query(
      `SELECT u.id FROM users u
       LEFT JOIN user_github_stats s ON s.user_id = u.id
       WHERE u.github_token IS NOT NULL
         AND (s.fetched_at IS NULL OR s.fetched_at < now() - interval '${STALE_HOURS} hours')
       LIMIT $1`,
      [BATCH_SIZE],
    );

    if (result.rows.length === 0) return;

    console.log(`[stats-scheduler] Refreshing ${result.rows.length} user(s)`);

    for (const row of result.rows) {
      try {
        await refreshUserStats(row.id);
      } catch (err) {
        console.warn(`[stats-scheduler] Failed to refresh ${row.id}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.warn("[stats-scheduler] Batch refresh error:", (err as Error).message);
  }
}

export function startStatsScheduler() {
  // Run first batch after a short delay (let server finish startup)
  setTimeout(refreshStaleBatch, 10_000);
  intervalId = setInterval(refreshStaleBatch, REFRESH_INTERVAL_MS);
  console.log("[stats-scheduler] Started (every 30 min)");
}

export function stopStatsScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
