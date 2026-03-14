import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { StoredToken, SquadsSettings } from "./types.js";

const SQUADS_DIR = join(homedir(), ".squads");
const TOKEN_PATH = join(SQUADS_DIR, "token.json");
const SETTINGS_PATH = join(SQUADS_DIR, "settings.json");

function ensureDir() {
  if (!existsSync(SQUADS_DIR)) {
    mkdirSync(SQUADS_DIR, { recursive: true });
  }
}

export function getServerUrl(): string {
  return process.env.SQUADS_SERVER_URL ?? "http://localhost:3000";
}

export function loadToken(): StoredToken | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function saveToken(token: StoredToken) {
  ensureDir();
  writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

export function clearToken() {
  if (existsSync(TOKEN_PATH)) {
    try { unlinkSync(TOKEN_PATH); } catch {}
  }
}

export function loadSettings(): SquadsSettings {
  const defaults: SquadsSettings = {
    overlay_mode: "toggle",
    current_room: null,
  };
  if (!existsSync(SETTINGS_PATH)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: SquadsSettings) {
  ensureDir();
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/** @deprecated Pending migration to Express server */
export function getSupabaseConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase not configured — pending migration to Express server");
  }
  return { supabaseUrl, supabaseAnonKey };
}
