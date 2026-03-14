import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// List friends (with status and direction)
router.get("/api/friends", async (req, res) => {
  try {
    const result = await query(
      `SELECT
         f.status,
         f.created_at,
         CASE WHEN f.user_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
         u.id AS friend_id,
         u.github_username,
         u.avatar_url
       FROM friends f
       JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
       WHERE f.user_id = $1 OR f.friend_id = $1
       ORDER BY f.created_at DESC`,
      [req.user!.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error listing friends:", err);
    res.status(500).json({ error: "Failed to list friends" });
  }
});

// Send friend request
router.post("/api/friends", async (req, res) => {
  const username = req.body.username || req.body.github_username;
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  try {
    const target = await query(
      `SELECT id FROM users WHERE github_username = $1`,
      [username],
    );
    if (target.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const friendId = target.rows[0].id;
    if (friendId === req.user!.id) {
      res.status(400).json({ error: "Cannot friend yourself" });
      return;
    }

    await query(
      `INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING`,
      [req.user!.id, friendId],
    );
    res.status(201).json({ sent: true, username });
  } catch (err) {
    console.error("Error sending friend request:", err);
    res.status(500).json({ error: "Failed to send friend request" });
  }
});

// Accept friend request
router.post("/api/friends/:username/accept", async (req, res) => {
  const { username } = req.params;
  try {
    const sender = await query(
      `SELECT id FROM users WHERE github_username = $1`,
      [username],
    );
    if (sender.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const result = await query(
      `UPDATE friends SET status = 'accepted'
       WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'
       RETURNING *`,
      [sender.rows[0].id, req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "No pending friend request from this user" });
      return;
    }
    res.json({ accepted: true, username });
  } catch (err) {
    console.error("Error accepting friend request:", err);
    res.status(500).json({ error: "Failed to accept friend request" });
  }
});

export default router;
