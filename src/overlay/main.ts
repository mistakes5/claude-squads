/**
 * Squade Code — Electron main process.
 *
 * Architecture: Full-screen transparent overlay.
 * - Window covers entire work area, transparent, always on top.
 * - Default: click-through with { forward: true } so mousemove reaches renderer.
 * - On mouseenter UI content → switch to interactive (clicks work).
 * - On mouseleave UI content → switch back to click-through.
 * - Dragging moves CSS position inside the window, NOT the window itself.
 * - No window resize on panel open/close — panel is CSS fixed positioned.
 * - Watcher daemon runs as a child process (auto-restart on crash).
 */

import {
  app, BrowserWindow, screen, ipcMain, Tray, Menu,
  nativeImage, globalShortcut, shell,
} from "electron";
import { join } from "path";
import {
  readFileSync, writeFileSync, existsSync,
  watchFile, unwatchFile, mkdirSync,
} from "fs";
import { homedir } from "os";
import { fork, ChildProcess } from "child_process";

// Load env vars for Supabase access (needed for OAuth, friends, DMs)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require("dotenv");
  dotenv.config({ path: join(__dirname, "../../.env") });
} catch {}

const SQUADS_DIR = join(homedir(), ".squads");
const STATE_FILE = join(SQUADS_DIR, "state.json");
const SETTINGS_FILE = join(SQUADS_DIR, "settings.json");
const TOKEN_FILE = join(SQUADS_DIR, "token.json");

function readSettings(): any {
  if (!existsSync(SETTINGS_FILE)) return {};
  try { return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")); } catch { return {}; }
}

function saveSettings(settings: any) {
  if (!existsSync(SQUADS_DIR)) mkdirSync(SQUADS_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let interactive = false;
let watcherProcess: ChildProcess | null = null;
let watcherShouldRestart = true;

function spawnWatcher() {
  const watcherPath = join(__dirname, "../watcher.js");
  if (!existsSync(watcherPath)) {
    console.warn("Watcher not found at", watcherPath);
    return;
  }
  // Don't spawn if not logged in — watcher will just crash with code 1
  if (!existsSync(TOKEN_FILE)) {
    console.log("Skipping watcher spawn: not logged in (no token.json)");
    return;
  }
  if (watcherProcess) {
    watcherProcess.kill("SIGTERM");
    // Wait briefly for old process to exit before spawning new one
    setTimeout(() => {
      watcherProcess = null;
      spawnWatcher();
    }, 500);
    return;
  }
  watcherProcess = fork(watcherPath, [], {
    env: { ...process.env },
    stdio: "pipe",
  });
  watcherProcess.stdout?.on("data", (d: Buffer) => console.log(`[watcher] ${d.toString().trim()}`));
  watcherProcess.stderr?.on("data", (d: Buffer) => console.error(`[watcher] ${d.toString().trim()}`));
  watcherProcess.on("exit", (code) => {
    console.log(`Watcher exited with code ${code}`);
    watcherProcess = null;
    // code 1 = "not logged in" — don't restart, wait for login
    // Only auto-restart on unexpected crashes (code > 1)
    if (watcherShouldRestart && code !== null && code > 1) {
      setTimeout(spawnWatcher, 3000);
    }
  });
}

function killWatcher() {
  watcherShouldRestart = false;
  if (watcherProcess) {
    watcherProcess.kill("SIGTERM");
    watcherProcess = null;
  }
}

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: sw,
    height: sh,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(join(__dirname, "overlay.html"));

  mainWindow.on("closed", () => { mainWindow = null; });
}

function setInteractive(on: boolean) {
  if (!mainWindow || interactive === on) return;
  interactive = on;
  if (on) {
    mainWindow.setIgnoreMouseEvents(false);
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
}

function readState(): any {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, "utf-8")); } catch { return null; }
}

function sendState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("state-update", readState());
}

// Lazy-loaded Supabase client for IPC handlers
let supabaseClient: any = null;

async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const { createClient } = await import("@supabase/supabase-js");
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Set session from stored token
  const tokenPath = join(SQUADS_DIR, "token.json");
  if (existsSync(tokenPath)) {
    try {
      const token = JSON.parse(readFileSync(tokenPath, "utf-8"));
      await supabaseClient.auth.setSession({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
      });
    } catch {}
  }

  return supabaseClient;
}

// ─── Single instance lock ───
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
});

app.whenReady().then(() => {
  // Ensure dock icon is visible (macOS)
  if (app.dock) app.dock.show();

  createWindow();

  // Spawn watcher daemon as child process
  watcherShouldRestart = true;
  spawnWatcher();

  // Watch state file
  watchFile(STATE_FILE, { interval: 1000 }, sendState);
  setTimeout(sendState, 500);

  // ─── IPC: interactive toggle ───
  ipcMain.on("enter-interactive", () => setInteractive(true));
  ipcMain.on("leave-interactive", () => setInteractive(false));

  // ─── IPC: settings ───
  ipcMain.on("save-setting", (_e, key: string, value: any) => {
    if (typeof key !== "string") return;
    const settings = readSettings();
    settings[key] = value;
    saveSettings(settings);
    mainWindow?.webContents.send("settings-update", settings);

    if (key === "always_on_top" && mainWindow) {
      mainWindow.setAlwaysOnTop(!!value);
    }
  });

  setTimeout(() => {
    mainWindow?.webContents.send("settings-update", readSettings());
  }, 600);

  // ─── IPC: screen size (sync) ───
  ipcMain.on("get-screen-size", (e) => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    e.returnValue = { width, height };
  });

  // ─── IPC: GitHub OAuth ───
  ipcMain.handle("trigger-login", async () => {
    try {
      const authModule = await import("../shared/auth.js");
      const user = await authModule.login();
      supabaseClient = null; // Reset client so it picks up new token
      // Restart watcher to pick up new auth
      watcherShouldRestart = true;
      spawnWatcher();
      sendState();
      return { success: true, username: user?.github_username };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Disconnect GitHub ───
  ipcMain.handle("trigger-logout", async () => {
    try {
      const authModule = await import("../shared/auth.js");
      authModule.logout();
      supabaseClient = null;
      killWatcher();
      // Write empty state so overlay clears
      if (!existsSync(SQUADS_DIR)) mkdirSync(SQUADS_DIR, { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify({
        room_name: "", room_slug: "", online: [], unread: 0,
        username: "", display_name: null, avatar_url: null,
        last_update: new Date().toISOString(),
        recent_messages: [], friends: [], dm_messages: {}, pending_invites: [],
      }, null, 2));
      sendState();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Add friend ───
  ipcMain.handle("add-friend", async (_e, githubUsername: string) => {
    try {
      const sb = await getSupabase();
      // Find user by username
      const { data: friendUser } = await sb
        .from("users")
        .select("id")
        .eq("github_username", githubUsername)
        .single();
      if (!friendUser) return { success: false, error: "User not found" };

      const tokenPath = join(SQUADS_DIR, "token.json");
      const token = JSON.parse(readFileSync(tokenPath, "utf-8"));

      await sb.from("friends").upsert({
        user_id: token.user.id,
        friend_id: friendUser.id,
        status: "pending",
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Accept friend ───
  ipcMain.handle("accept-friend", async (_e, githubUsername: string) => {
    try {
      const sb = await getSupabase();
      const { data: friendUser } = await sb
        .from("users")
        .select("id")
        .eq("github_username", githubUsername)
        .single();
      if (!friendUser) return { success: false, error: "User not found" };

      const tokenPath = join(SQUADS_DIR, "token.json");
      const token = JSON.parse(readFileSync(tokenPath, "utf-8"));

      // Update their request to accepted
      await sb.from("friends")
        .update({ status: "accepted" })
        .eq("user_id", friendUser.id)
        .eq("friend_id", token.user.id);

      // Create reverse friendship
      await sb.from("friends").upsert({
        user_id: token.user.id,
        friend_id: friendUser.id,
        status: "accepted",
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Send DM ───
  ipcMain.handle("send-dm", async (_e, friendId: string, content: string) => {
    try {
      const sb = await getSupabase();
      const tokenPath = join(SQUADS_DIR, "token.json");
      const token = JSON.parse(readFileSync(tokenPath, "utf-8"));
      const sorted = [token.user.id, friendId].sort();
      const channelId = `dm:${sorted.join(":")}`;

      const channel = sb.channel(channelId);
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "dm",
        payload: {
          username: token.user.github_username,
          content,
          created_at: new Date().toISOString(),
        },
      });
      await channel.unsubscribe();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Invite to squad ───
  ipcMain.handle("invite-to-squad", async (_e, friendId: string) => {
    try {
      const sb = await getSupabase();
      const tokenPath = join(SQUADS_DIR, "token.json");
      const token = JSON.parse(readFileSync(tokenPath, "utf-8"));
      const settings = readSettings();
      const roomSlug = settings.current_room;
      if (!roomSlug) return { success: false, error: "Not in a room" };

      // Get room name
      const { data: room } = await sb.from("rooms").select("name").eq("slug", roomSlug).single();
      const roomName = room?.name || roomSlug;

      const channel = sb.channel(`invites:${friendId}`);
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "squad_invite",
        payload: {
          from_username: token.user.github_username,
          room_slug: roomSlug,
          room_name: roomName,
        },
      });
      await channel.unsubscribe();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Accept invite (join room) ───
  ipcMain.handle("accept-invite", async (_e, roomSlug: string) => {
    try {
      const sb = await getSupabase();
      const tokenPath = join(SQUADS_DIR, "token.json");
      const token = JSON.parse(readFileSync(tokenPath, "utf-8"));

      const { data: room } = await sb.from("rooms").select("id").eq("slug", roomSlug).single();
      if (!room) return { success: false, error: "Room not found" };

      await sb.from("room_members").upsert({
        room_id: room.id,
        user_id: token.user.id,
      });

      // Update current room setting
      const settings = readSettings();
      settings.current_room = roomSlug;
      saveSettings(settings);
      mainWindow?.webContents.send("settings-update", settings);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── Global shortcut ───
  const shortcutLabel = process.platform === "darwin" ? "Cmd+Shift+S" : "Ctrl+Shift+S";

  globalShortcut.register("CommandOrControl+Shift+S", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });

  // ─── Tray ───
  const trayIcon = nativeImage.createFromBuffer(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVQ4T2P8z8Dwn4EIwEgMA5iI" +
      "0c1ADAPIcQFRBjAxkGgAyS4gxWBGUgIRpwaS4ohsA8hJB6QkZADmuBcRgSBqeAAAAABJRU5ErkJggg==",
      "base64"
    )
  );
  tray = new Tray(trayIcon);
  tray.setToolTip("Squade Code");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Show/Hide (${shortcutLabel})`,
        click: () => {
          if (mainWindow?.isVisible()) mainWindow.hide();
          else mainWindow?.show();
        },
      },
      { type: "separator" },
      { label: "Quit Squade Code", click: () => app.quit() },
    ])
  );
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  unwatchFile(STATE_FILE);
  killWatcher();
});

app.on("window-all-closed", () => app.quit());
