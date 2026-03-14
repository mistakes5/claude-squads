import type { Socket, Server as SocketServer } from "socket.io";

export function registerDmHandlers(io: SocketServer, socket: Socket) {
  const user = (socket as unknown as { user: { id: string; username: string } }).user;

  socket.on("send-dm", ({ friendId, content }: { friendId: string; content: string }) => {
    const timestamp = new Date().toISOString();

    io.to(`user:${friendId}`).emit("dm", {
      from: user.id,
      fromUsername: user.username,
      content,
      timestamp,
    });

    // Echo DM back to sender's room for cross-device sync
    io.to(`user:${user.id}`).emit("dm", {
      from: user.id,
      fromUsername: user.username,
      content,
      timestamp,
      isSelf: true,
    });
  });
}
