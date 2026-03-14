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
import { ChildProcess, spawn } from "child_process";

// Load env vars — try project root first, then fall back to packaged app location
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require("dotenv");
  // In dev: __dirname = squads/dist/overlay → ../../.env = squads/.env
  // In packaged: app.asar won't have .env, so also check ~/.squads/.env
  dotenv.config({ path: join(__dirname, "../../.env") });
  dotenv.config({ path: join(homedir(), ".squads", ".env") });
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
  // Resolve watcher script — works in both dev (dist/) and packaged (app.asar)
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
    setTimeout(() => {
      watcherProcess = null;
      spawnWatcher();
    }, 500);
    return;
  }
  // Use spawn with Electron's own executable as the Node runtime.
  // In packaged apps, fork() fails because there's no standalone node binary.
  // process.execPath points to the Electron binary which can run JS with --require.
  const child = spawn(process.execPath, [watcherPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watcherProcess = child as unknown as ChildProcess;
  child.stdout?.on("data", (d: Buffer) => console.log(`[watcher] ${d.toString().trim()}`));
  child.stderr?.on("data", (d: Buffer) => console.error(`[watcher] ${d.toString().trim()}`));
  child.on("exit", (code) => {
    console.log(`Watcher exited with code ${code}`);
    watcherProcess = null;
    if (watcherShouldRestart && code !== null && code !== 0) {
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

// ─── API helper for Express server ───
function getServerUrl(): string {
  return process.env.SQUADS_SERVER_URL ?? "http://localhost:3000";
}

function getAuthHeaders(): Record<string, string> {
  if (!existsSync(TOKEN_FILE)) return {};
  try {
    const token = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    return { Authorization: `Bearer ${token.access_token}` };
  } catch {
    return {};
  }
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const url = `${getServerUrl()}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
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
      await apiFetch("/api/friends", {
        method: "POST",
        body: JSON.stringify({ github_username: githubUsername }),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Accept friend ───
  ipcMain.handle("accept-friend", async (_e, githubUsername: string) => {
    try {
      await apiFetch(`/api/friends/${encodeURIComponent(githubUsername)}/accept`, {
        method: "POST",
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Send DM ───
  ipcMain.handle("send-dm", async (_e, friendId: string, content: string) => {
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({ friend_id: friendId, content }),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: DM history ───
  ipcMain.handle("get-dm-history", async (_e, friendId: string) => {
    try {
      const data = await apiFetch(`/api/messages/dm/${encodeURIComponent(friendId)}`);
      return { success: true, messages: data };
    } catch (err: any) {
      return { success: false, error: err.message, messages: [] };
    }
  });

  // ─── IPC: Invite to squad ───
  ipcMain.handle("invite-to-squad", async (_e, friendId: string) => {
    try {
      const settings = readSettings();
      const roomSlug = settings.current_room;
      if (!roomSlug) return { success: false, error: "Not in a room" };

      await apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/invite`, {
        method: "POST",
        body: JSON.stringify({ friend_id: friendId }),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── IPC: Accept invite (join room) ───
  ipcMain.handle("accept-invite", async (_e, roomSlug: string) => {
    try {
      await apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/join`, {
        method: "POST",
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
