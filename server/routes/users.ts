import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// Current user profile
router.get("/api/users/me", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, github_id, github_username, avatar_url, created_at
       FROM users WHERE id = $1`,
      [req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Lookup by GitHub username
router.get("/api/users/:username", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, github_username, avatar_url, created_at
       FROM users WHERE github_username = $1`,
      [req.params.username],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
