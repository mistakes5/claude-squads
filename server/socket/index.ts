import type { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { registerRoomHandlers } from "./rooms.js";
import { registerDmHandlers } from "./dm.js";
import { registerInviteHandlers } from "./invites.js";

const onlineUsers = new Map<string, { id: string; username: string }>();

export function setupSocketHandlers(io: SocketServer) {
  // Socket.io auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
        sub: string;
        username: string;
      };
      (socket as unknown as { user: { id: string; username: string } }).user = {
        id: payload.sub,
        username: payload.username,
      };
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as unknown as { user: { id: string; username: string } }).user;

    // Join personal room and lobby
    socket.join(`user:${user.id}`);
    socket.join("lobby");

    // Track online status
    onlineUsers.set(user.id, { id: user.id, username: user.username });
    io.to("lobby").emit("presence-update", {
      online: Array.from(onlineUsers.values()),
    });

    // Register handlers
    registerRoomHandlers(io, socket);
    registerDmHandlers(io, socket);
    registerInviteHandlers(io, socket);

    socket.on("disconnect", () => {
      onlineUsers.delete(user.id);
      io.to("lobby").emit("presence-update", {
        online: Array.from(onlineUsers.values()),
      });
    });
  });
}
