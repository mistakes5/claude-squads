import type { Socket, Server as SocketServer } from "socket.io";

export function registerInviteHandlers(io: SocketServer, socket: Socket) {
  const user = (socket as unknown as { user: { id: string; username: string } }).user;

  socket.on(
    "send-invite",
    ({ friendId, roomSlug, roomName }: { friendId: string; roomSlug: string; roomName: string }) => {
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
