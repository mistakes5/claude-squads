import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// Get pending invites for the current user
router.get("/api/invites", async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, r.name AS room_name, r.slug AS room_slug, u.github_username AS from_username
       FROM invites i
       JOIN rooms r ON i.room_id = r.id
       JOIN users u ON i.from_user_id = u.id
       WHERE i.to_user_id = $1 AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [req.user!.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching invites:", err);
    res.status(500).json({ error: "Failed to fetch invites" });
  }
});

// Accept an invite
router.post("/api/invites/:id/accept", async (req, res) => {
  try {
    const result = await query(
      `UPDATE invites SET status = 'accepted' WHERE id = $1 AND to_user_id = $2 RETURNING room_id`,
      [req.params.id, req.user!.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    // Auto-join the room
    await query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [result.rows[0].room_id, req.user!.id],
    );

    res.json({ accepted: true });
  } catch (err) {
    console.error("Error accepting invite:", err);
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

// Decline an invite
router.post("/api/invites/:id/decline", async (req, res) => {
  try {
    await query(
      `UPDATE invites SET status = 'declined' WHERE id = $1 AND to_user_id = $2`,
      [req.params.id, req.user!.id],
    );
    res.json({ declined: true });
  } catch (err) {
    console.error("Error declining invite:", err);
    res.status(500).json({ error: "Failed to decline invite" });
  }
});

export default router;
