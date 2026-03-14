import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";
import { refreshUserStats } from "../services/github-stats.js";

const router = Router();

// Rate limit tracking for force-refresh (in-memory, per-user)
const lastRefresh = new Map<string, number>();
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// ─── GET /api/gamification/me — authed user's stats ─────────
router.get("/api/gamification/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [statsResult, achievementsResult] = await Promise.all([
      query("SELECT * FROM user_github_stats WHERE user_id = $1", [userId]),
      query(
        `SELECT a.id, a.name, a.description, a.icon, ua.earned_at
         FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = $1 ORDER BY ua.earned_at DESC`,
        [userId],
      ),
    ]);

    if (statsResult.rows.length === 0) {
      res.json({ xp: 0, tier: "bronze", achievements: [], badge_count: 0, stats: null });
      return;
    }

    const stats = statsResult.rows[0];
    res.json({
      xp: stats.xp,
      tier: stats.tier,
      contributions: stats.contributions,
      public_repos: stats.public_repos,
      pull_requests: stats.pull_requests,
      followers: stats.followers,
      longest_streak: stats.longest_streak,
      account_age_days: stats.account_age_days,
      achievements: achievementsResult.rows,
      badge_count: achievementsResult.rows.length,
      fetched_at: stats.fetched_at,
    });
  } catch (err) {
    console.error("GET /api/gamification/me error:", err);
    res.status(500).json({ error: "Failed to fetch gamification data" });
  }
});

// ─── GET /api/gamification/leaderboard ──────────────────────
router.get("/api/gamification/leaderboard", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit) || "10", 10), 50);
    const result = await query(
      `SELECT s.xp, s.tier, u.github_username, u.avatar_url
       FROM user_github_stats s JOIN users u ON u.id = s.user_id
       ORDER BY s.xp DESC LIMIT $1`,
      [limit],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/gamification/leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ─── POST /api/gamification/refresh — force refresh (rate-limited) ─
router.post("/api/gamification/refresh", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const last = lastRefresh.get(userId) ?? 0;
  if (Date.now() - last < REFRESH_COOLDOWN_MS) {
    const retryAfter = Math.ceil((REFRESH_COOLDOWN_MS - (Date.now() - last)) / 1000);
    res.status(429).json({ error: "Too soon", retry_after_seconds: retryAfter });
    return;
  }

  try {
    lastRefresh.set(userId, Date.now());
    const result = await refreshUserStats(userId);
    if (!result) {
      res.status(404).json({ error: "No GitHub token found — please re-login" });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("POST /api/gamification/refresh error:", err);
    res.status(500).json({ error: "Refresh failed" });
  }
});

// ─── GET /api/gamification/:username — public stats ─────────
router.get("/api/gamification/:username", requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const userResult = await query(
      "SELECT id FROM users WHERE github_username = $1",
      [username],
    );
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userId = userResult.rows[0].id;
    const [statsResult, achievementsResult] = await Promise.all([
      query("SELECT * FROM user_github_stats WHERE user_id = $1", [userId]),
      query(
        `SELECT a.id, a.name, a.description, a.icon, ua.earned_at
         FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = $1 ORDER BY ua.earned_at DESC`,
        [userId],
      ),
    ]);

    if (statsResult.rows.length === 0) {
      res.json({ username, xp: 0, tier: "bronze", achievements: [], badge_count: 0 });
      return;
    }

    const stats = statsResult.rows[0];
    res.json({
      username,
      xp: stats.xp,
      tier: stats.tier,
      achievements: achievementsResult.rows,
      badge_count: achievementsResult.rows.length,
    });
  } catch (err) {
    console.error("GET /api/gamification/:username error:", err);
    res.status(500).json({ error: "Failed to fetch gamification data" });
  }
});

// ─── POST /api/gamification/batch — batch fetch for multiple users ─
router.post("/api/gamification/batch", requireAuth, async (req, res) => {
  try {
    const { usernames } = req.body as { usernames: string[] };
    if (!Array.isArray(usernames) || usernames.length === 0) {
      res.json({});
      return;
    }

    // Limit to 50 users
    const limited = usernames.slice(0, 50);
    const placeholders = limited.map((_, i) => `$${i + 1}`).join(",");
    const result = await query(
      `SELECT u.github_username, s.xp, s.tier,
              (SELECT count(*) FROM user_achievements ua WHERE ua.user_id = u.id) as badge_count
       FROM users u LEFT JOIN user_github_stats s ON s.user_id = u.id
       WHERE u.github_username IN (${placeholders})`,
      limited,
    );

    const map: Record<string, { xp: number; tier: string; badge_count: number }> = {};
    for (const row of result.rows) {
      map[row.github_username] = {
        xp: row.xp ?? 0,
        tier: row.tier ?? "bronze",
        badge_count: parseInt(row.badge_count) || 0,
      };
    }
    res.json(map);
  } catch (err) {
    console.error("POST /api/gamification/batch error:", err);
    res.status(500).json({ error: "Batch fetch failed" });
  }
});

export default router;
