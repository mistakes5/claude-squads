import type { Socket, Server as SocketServer } from "socket.io";
import { query } from "../db.js";

export function registerInviteHandlers(io: SocketServer, socket: Socket) {
  const user = (socket as unknown as { user: { id: string; username: string } }).user;

  socket.on(
    "send-invite",
    async ({ friendId, roomSlug, roomName }: { friendId: string; roomSlug: string; roomName: string }) => {
      // Persist the invite to DB
      try {
        const room = await query(`SELECT id FROM rooms WHERE slug = $1`, [roomSlug]);
        if (room.rows.length > 0) {
          await query(
            `INSERT INTO invites (from_user_id, to_user_id, room_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (from_user_id, to_user_id, room_id) DO UPDATE SET status = 'pending', created_at = now()`,
            [user.id, friendId, room.rows[0].id],
          );
        }
      } catch (err) {
        console.warn("Failed to persist invite:", (err as Error).message);
      }

      // Real-time notification (even if DB fails)
      io.to(`user:${friendId}`).emit("invite", {
        from: user.id,
        fromUsername: user.username,
        roomSlug,
        roomName,
        timestamp: new Date().toISOString(),
      });
    },
  );
}
