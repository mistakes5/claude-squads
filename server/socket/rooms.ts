import type { Socket, Server as SocketServer } from "socket.io";

export function registerRoomHandlers(io: SocketServer, socket: Socket) {
  const user = (socket as unknown as { user: { id: string; username: string } }).user;

  socket.on("join-room", async ({ slug }: { slug: string }) => {
    const roomKey = `room:${slug}`;
    socket.join(roomKey);
    io.to(roomKey).emit("room-presence", {
      type: "joined",
      username: user.username,
      userId: user.id,
      slug,
    });
  });

  socket.on("leave-room", ({ slug }: { slug: string }) => {
    const roomKey = `room:${slug}`;
    io.to(roomKey).emit("room-presence", {
      type: "left",
      username: user.username,
      userId: user.id,
      slug,
    });
    socket.leave(roomKey);
  });

  socket.on("send-emote", ({ slug, emote }: { slug: string; emote: string }) => {
    io.to(`room:${slug}`).emit("emote", {
      username: user.username,
      userId: user.id,
      emote,
      slug,
    });
  });
}
