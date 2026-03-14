import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// List public rooms
router.get("/api/rooms", async (_req, res) => {
  try {
    const result = await query(
      `SELECT r.*, u.github_username AS created_by_username
       FROM rooms r
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.is_public = true
       ORDER BY r.created_at DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error listing rooms:", err);
    res.status(500).json({ error: "Failed to list rooms" });
  }
});

// List user's rooms
router.get("/api/rooms/mine", async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, rm.joined_at
       FROM rooms r
       JOIN room_members rm ON rm.room_id = r.id
       WHERE rm.user_id = $1
       ORDER BY rm.joined_at DESC`,
      [req.user!.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error listing user rooms:", err);
    res.status(500).json({ error: "Failed to list your rooms" });
  }
});

// Create room
router.post("/api/rooms", async (req, res) => {
  const { name, slug, is_public = true } = req.body;
  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  try {
    const result = await query(
      `INSERT INTO rooms (name, slug, created_by, is_public)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, slug, req.user!.id, is_public],
    );

    // Auto-join the creator
    await query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)`,
      [result.rows[0].id, req.user!.id],
    );

    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505") {
      res.status(409).json({ error: "A room with that slug already exists" });
      return;
    }
    console.error("Error creating room:", err);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// Join room
router.post("/api/rooms/:slug/join", async (req, res) => {
  const { slug } = req.params;
  try {
    const room = await query(`SELECT id, is_public FROM rooms WHERE slug = $1`, [slug]);
    if (room.rows.length === 0) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    if (!room.rows[0].is_public) {
      res.status(403).json({ error: "Cannot join a private room" });
      return;
    }

    await query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [room.rows[0].id, req.user!.id],
    );
    res.json({ joined: true, slug });
  } catch (err) {
    console.error("Error joining room:", err);
    res.status(500).json({ error: "Failed to join room" });
  }
});

// Leave room
router.delete("/api/rooms/:slug/leave", async (req, res) => {
  const { slug } = req.params;
  try {
    const room = await query(`SELECT id FROM rooms WHERE slug = $1`, [slug]);
    if (room.rows.length === 0) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    await query(
      `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [room.rows[0].id, req.user!.id],
    );
    res.json({ left: true, slug });
  } catch (err) {
    console.error("Error leaving room:", err);
    res.status(500).json({ error: "Failed to leave room" });
  }
});

export default router;
