import { Router } from "express";
import type { Server as SocketServer } from "socket.io";
import { requireAuth } from "../middleware.js";
import { query } from "../db.js";

let io: SocketServer;

export function setSocketServer(socketServer: SocketServer) {
  io = socketServer;
}

const router = Router();
router.use(requireAuth);

// Get recent messages for a room (last 50)
router.get("/api/rooms/:slug/messages", async (req, res) => {
  const { slug } = req.params;
  try {
    const room = await query(`SELECT id FROM rooms WHERE slug = $1`, [slug]);
    if (room.rows.length === 0) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const result = await query(
      `SELECT m.*, u.github_username, u.avatar_url
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.room_id = $1
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [room.rows[0].id],
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Send a message to a room
router.post("/api/rooms/:slug/messages", async (req, res) => {
  const { slug } = req.params;
  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    const room = await query(`SELECT id FROM rooms WHERE slug = $1`, [slug]);
    if (room.rows.length === 0) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const result = await query(
      `INSERT INTO messages (room_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [room.rows[0].id, req.user!.id, content],
    );

    const message = {
      ...result.rows[0],
      github_username: req.user!.username,
    };

    // Broadcast to room via Socket.io
    if (io) {
      io.to(`room:${slug}`).emit("new-message", message);
    }

    res.status(201).json(message);
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
