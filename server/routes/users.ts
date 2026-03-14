import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// Current user profile
router.get("/api/users/me", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, github_id, github_username, avatar_url, display_name, created_at
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

// Update display name (plaintext only, max 32 chars)
router.patch("/api/users/me", async (req, res) => {
  const { display_name } = req.body;
  if (display_name !== null && typeof display_name !== "string") {
    res.status(400).json({ error: "display_name must be a string or null" });
    return;
  }
  // Sanitize: plaintext only, strip HTML/emoji, cap length
  const cleaned = display_name
    ? display_name.replace(/<[^>]*>/g, "").trim().slice(0, 32) || null
    : null;
  try {
    const result = await query(
      `UPDATE users SET display_name = $1 WHERE id = $2
       RETURNING id, github_username, avatar_url, display_name`,
      [cleaned, req.user!.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating display name:", err);
    res.status(500).json({ error: "Failed to update display name" });
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
