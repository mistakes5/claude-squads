import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";
import { getGamificationPlugin } from "../gamification-plugin.js";

const router = Router();

// Rate limit tracking for force-refresh (in-memory, per-user)
const lastRefresh = new Map<string, number>();
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// ─── Border definitions (tier-based + achievement-based) ────
const TIER_BORDERS = [
  { id: "bronze", name: "Bronze", type: "tier", tier_required: "bronze" },
  { id: "silver", name: "Silver", type: "tier", tier_required: "silver" },
  { id: "gold", name: "Gold", type: "tier", tier_required: "gold" },
  { id: "diamond", name: "Diamond", type: "tier", tier_required: "diamond" },
  { id: "mythic", name: "Mythic", type: "tier", tier_required: "mythic" },
];

const ACHIEVEMENT_BORDERS = [
  { id: "border-fire", name: "On Fire", type: "achievement", achievement_required: "streak-30", icon: "🔥" },
  { id: "border-unstoppable", name: "Unstoppable", type: "achievement", achievement_required: "streak-100", icon: "💎" },
  { id: "border-celebrity", name: "Celebrity", type: "achievement", achievement_required: "followers-500", icon: "👑" },
  { id: "border-ancient", name: "Ancient One", type: "achievement", achievement_required: "year-10", icon: "🏆" },
  { id: "border-empire", name: "Empire Builder", type: "achievement", achievement_required: "repo-50", icon: "🏗️" },
  { id: "border-merge", name: "Merge Master", type: "achievement", achievement_required: "pr-200", icon: "🎯" },
];

const TIER_ORDER = ["bronze", "silver", "gold", "diamond", "mythic"];

function getAvailableBorders(userTier: string, earnedAchievements: string[]) {
  const tierIdx = TIER_ORDER.indexOf(userTier);
  const tierBorders = TIER_BORDERS.filter(
    (b) => TIER_ORDER.indexOf(b.tier_required) <= tierIdx,
  );
  const achBorders = ACHIEVEMENT_BORDERS.filter((b) =>
    earnedAchievements.includes(b.achievement_required),
  );
  return [{ id: "auto", name: "Auto (Your Tier)", type: "auto" }, ...tierBorders, ...achBorders];
}

// ─── GET /api/gamification/me — authed user's stats ─────────
router.get("/api/gamification/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [statsResult, achievementsResult, userResult] = await Promise.all([
      query("SELECT * FROM user_github_stats WHERE user_id = $1", [userId]),
      query(
        `SELECT a.id, a.name, a.description, a.icon, ua.earned_at
         FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = $1 ORDER BY ua.earned_at DESC`,
        [userId],
      ),
      query("SELECT selected_border FROM users WHERE id = $1", [userId]),
    ]);

    const selectedBorder = userResult.rows[0]?.selected_border ?? "auto";

    if (statsResult.rows.length === 0) {
      res.json({
        xp: 0, tier: "bronze", achievements: [], badge_count: 0, stats: null,
        selected_border: selectedBorder,
        available_borders: getAvailableBorders("bronze", []),
      });
      return;
    }

    const stats = statsResult.rows[0];
    const earnedIds = achievementsResult.rows.map((a: { id: string }) => a.id);
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
      selected_border: selectedBorder,
      available_borders: getAvailableBorders(stats.tier, earnedIds),
    });
  } catch (err) {
    console.error("GET /api/gamification/me error:", err);
    res.status(500).json({ error: "Failed to fetch gamification data" });
  }
});

// ─── PUT /api/gamification/border — select active border ────
router.put("/api/gamification/border", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { border_id } = req.body as { border_id: string };

    if (!border_id || typeof border_id !== "string") {
      res.status(400).json({ error: "border_id is required" });
      return;
    }

    // Validate the user actually owns this border
    if (border_id !== "auto") {
      const [statsResult, achievementsResult] = await Promise.all([
        query("SELECT tier FROM user_github_stats WHERE user_id = $1", [userId]),
        query(
          "SELECT achievement_id FROM user_achievements WHERE user_id = $1",
          [userId],
        ),
      ]);

      const userTier = statsResult.rows[0]?.tier ?? "bronze";
      const earnedIds = achievementsResult.rows.map((r: { achievement_id: string }) => r.achievement_id);
      const available = getAvailableBorders(userTier, earnedIds);

      if (!available.some((b) => b.id === border_id)) {
        res.status(403).json({ error: "Border not unlocked" });
        return;
      }
    }

    await query("UPDATE users SET selected_border = $1 WHERE id = $2", [border_id, userId]);
    res.json({ selected_border: border_id });
  } catch (err) {
    console.error("PUT /api/gamification/border error:", err);
    res.status(500).json({ error: "Failed to update border" });
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

  const plugin = getGamificationPlugin();
  if (!plugin) {
    res.status(501).json({ error: "Gamification plugin not installed" });
    return;
  }

  try {
    lastRefresh.set(userId, Date.now());
    const result = await plugin.refreshUserStats(userId);
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
