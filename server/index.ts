import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import cors from "cors";

import authRouter from "./auth.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();
const httpServer = createServer(app);

// CORS — dynamic origins: production URL + localhost for dev
const CORS_ORIGINS = [
  process.env.SQUADS_SERVER_URL,
  "http://localhost:54321",
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean) as string[];

app.use(cors({ origin: CORS_ORIGINS, credentials: true }));

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes (work without DB)
app.use(authRouter);

// Socket.io
const io = new SocketServer(httpServer, {
  cors: { origin: CORS_ORIGINS, credentials: true },
});

// DB-dependent routes — load gracefully so server starts without Postgres
async function loadDbRoutes() {
  try {
    const [rooms, friends, messages, users] = await Promise.all([
      import("./routes/rooms.js"),
      import("./routes/friends.js"),
      import("./routes/messages.js"),
      import("./routes/users.js"),
    ]);

    const invitesRoute = await import("./routes/invites.js");

    app.use(rooms.default);
    app.use(friends.default);
    app.use(messages.default);
    app.use(users.default);
    app.use(invitesRoute.default);

    messages.setSocketServer(io);
    rooms.setRoomsSocketServer(io);

    // Optional modules
    try {
      const [activities, pings, gamification] = await Promise.all([
        import("./routes/activities.js"),
        import("./routes/pings.js"),
        import("./routes/gamification.js"),
      ]);
      app.use(activities.default);
      app.use(pings.default);
      app.use(gamification.default);
      activities.setActivitiesSocketServer(io);
      pings.setPingsSocketServer(io);
    } catch {}

    // Start gamification stats scheduler
    try {
      const { startStatsScheduler } = await import("./services/stats-scheduler.js");
      startStatsScheduler();
    } catch {}

    const { setupSocketHandlers } = await import("./socket/index.js");
    setupSocketHandlers(io);

    console.log("✓ All routes loaded (DB connected)");
  } catch (err) {
    console.warn("⚠ DB routes unavailable — auth-only mode:", (err as Error).message);
  }
}

loadDbRoutes();

httpServer.listen(PORT, () => {
  console.log(`Squads server listening on port ${PORT}`);
});

export { app, httpServer, io };
