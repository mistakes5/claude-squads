import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import cors from "cors";

import authRouter from "./auth.js";
import roomsRouter from "./routes/rooms.js";
import friendsRouter from "./routes/friends.js";
import messagesRouter, { setSocketServer } from "./routes/messages.js";
import usersRouter from "./routes/users.js";
import { setupSocketHandlers } from "./socket/index.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();
const httpServer = createServer(app);

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:54321",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    credentials: true,
  }),
);

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use(authRouter);
app.use(roomsRouter);
app.use(friendsRouter);
app.use(messagesRouter);
app.use(usersRouter);

// Socket.io
const io = new SocketServer(httpServer, {
  cors: {
    origin: [
      "http://localhost:54321",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    credentials: true,
  },
});

setSocketServer(io);
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Squads server listening on port ${PORT}`);
});

export { app, httpServer, io };
