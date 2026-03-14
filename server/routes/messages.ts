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

// Send a DM to a friend (persisted to direct_messages table)
router.post("/api/messages", async (req, res) => {
  const { friend_id, content } = req.body;
  if (!friend_id || !content) {
    res.status(400).json({ error: "friend_id and content are required" });
    return;
  }

  try {
    // Persist the DM
    await query(
      `INSERT INTO direct_messages (sender_id, recipient_id, content)
       VALUES ($1, $2, $3)`,
      [req.user!.id, friend_id, content],
    );

    const timestamp = new Date().toISOString();

    // Emit DM via Socket.io to the friend's personal room
    if (io) {
      io.to(`user:${friend_id}`).emit("dm", {
        from: req.user!.id,
        fromUsername: req.user!.username,
        content,
        timestamp,
      });

      // Echo DM back to sender for cross-device sync
      io.to(`user:${req.user!.id}`).emit("dm", {
        from: req.user!.id,
        fromUsername: req.user!.username,
        content,
        timestamp,
        isSelf: true,
      });
    }

    res.status(201).json({ sent: true });
  } catch (err) {
    console.error("Error sending DM:", err);
    res.status(500).json({ error: "Failed to send DM" });
  }
});

// Get DM history with a friend (last 50 messages)
router.get("/api/messages/dm/:friendId", async (req, res) => {
  const { friendId } = req.params;
  const userId = req.user!.id;

  try {
    const result = await query(
      `SELECT dm.id, dm.sender_id, dm.recipient_id, dm.content, dm.created_at,
              u.github_username
       FROM direct_messages dm
       JOIN users u ON dm.sender_id = u.id
       WHERE (dm.sender_id = $1 AND dm.recipient_id = $2)
          OR (dm.sender_id = $2 AND dm.recipient_id = $1)
       ORDER BY dm.created_at ASC
       LIMIT 50`,
      [userId, friendId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching DM history:", err);
    res.status(500).json({ error: "Failed to fetch DM history" });
  }
});

export default router;
