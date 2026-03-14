import { Router } from "express";
import type { Server as SocketServer } from "socket.io";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

let io: SocketServer;

export function setActivitiesSocketServer(socketServer: SocketServer) {
  io = socketServer;
}

const router = Router();
router.use(requireAuth);

// Get recent activities for a room
router.get("/api/rooms/:slug/activities", async (req, res) => {
  const { slug } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  try {
    const room = await query(`SELECT id FROM rooms WHERE slug = $1`, [slug]);
    if (room.rows.length === 0) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const result = await query(
      `SELECT a.*, u.github_username, u.avatar_url
       FROM activities a
       JOIN users u ON a.user_id = u.id
       WHERE a.room_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [room.rows[0].id, limit],
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error("Error fetching activities:", err);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

// Post an activity to a room
router.post("/api/rooms/:slug/activities", async (req, res) => {
  const { slug } = req.params;
  const { action, detail } = req.body;
  if (!action) {
    res.status(400).json({ error: "action is required" });
    return;
  }

  try {
    const room = await query(`SELECT id FROM rooms WHERE slug = $1`, [slug]);
    if (room.rows.length === 0) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const result = await query(
      `INSERT INTO activities (room_id, user_id, action, detail)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [room.rows[0].id, req.user!.id, action, detail || null],
    );

    const activity = {
      ...result.rows[0],
      github_username: req.user!.username,
    };

    if (io) {
      io.to(`room:${slug}`).emit("activity", activity);
    }

    res.status(201).json(activity);
  } catch (err) {
    console.error("Error posting activity:", err);
    res.status(500).json({ error: "Failed to post activity" });
  }
});

export default router;
