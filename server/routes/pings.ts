import { Router } from "express";
import type { Server as SocketServer } from "socket.io";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

let io: SocketServer;

export function setPingsSocketServer(socketServer: SocketServer) {
  io = socketServer;
}

const router = Router();
router.use(requireAuth);

// Send a ping to a user
router.post("/api/pings", async (req, res) => {
  const { username, message, slug } = req.body;
  if (!username || !message) {
    res.status(400).json({ error: "username and message are required" });
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

    // Get room_id if slug provided
    let roomId = null;
    if (slug) {
      const room = await query(`SELECT id FROM rooms WHERE slug = $1`, [slug]);
      if (room.rows.length > 0) roomId = room.rows[0].id;
    }

    // Insert as activity with action='ping', detail contains target + message
    const detail = JSON.stringify({
      to_user_id: target.rows[0].id,
      to_username: username,
      message,
    });

    const result = await query(
      `INSERT INTO activities (room_id, user_id, action, detail)
       VALUES ($1, $2, 'ping', $3)
       RETURNING *`,
      [roomId, req.user!.id, detail],
    );

    // Emit to target user's personal room
    if (io) {
      io.to(`user:${target.rows[0].id}`).emit("ping", {
        from: req.user!.id,
        from_username: req.user!.username,
        message,
        slug: slug || null,
        timestamp: result.rows[0].created_at,
      });
    }

    res.status(201).json({ sent: true, to: username });
  } catch (err) {
    console.error("Error sending ping:", err);
    res.status(500).json({ error: "Failed to send ping" });
  }
});

// Get pending pings for the current user
router.get("/api/pings", async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, u.github_username AS from_username, u.avatar_url AS from_avatar
       FROM activities a
       JOIN users u ON a.user_id = u.id
       WHERE a.action = 'ping'
         AND a.detail::jsonb->>'to_user_id' = $1
       ORDER BY a.created_at DESC
       LIMIT 20`,
      [req.user!.id],
    );

    const pings = result.rows.map((row) => ({
      id: row.id,
      from_username: row.from_username,
      from_avatar: row.from_avatar,
      message: JSON.parse(row.detail).message,
      slug: row.room_id ? null : null, // room lookup would require join
      created_at: row.created_at,
    }));

    res.json(pings);
  } catch (err) {
    console.error("Error fetching pings:", err);
    res.status(500).json({ error: "Failed to fetch pings" });
  }
});

export default router;
