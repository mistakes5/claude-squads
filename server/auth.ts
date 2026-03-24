import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { query } from "./db.js";

const router = Router();

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_DAYS = 90;

// ─── Refresh token helpers ───

let tableEnsured = false;
async function ensureRefreshTable() {
  if (tableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    tableEnsured = true;
  } catch {}
}

async function createRefreshToken(userId: string, username: string): Promise<string | null> {
  const token = crypto.randomBytes(48).toString("hex");
  try {
    await ensureRefreshTable();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400_000);
    await query(
      `INSERT INTO refresh_tokens (token, user_id, username, expires_at) VALUES ($1, $2, $3, $4)`,
      [token, userId, username, expiresAt],
    );
    return token;
  } catch {
    return null;
  }
}

router.get("/auth/github", (req, res) => {
  // Client passes callback_port as query param; default 54321 for backwards compat
  const callbackPort = req.query.callback_port || "54321";
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${process.env.SQUADS_SERVER_URL ?? "https://squade-server-production.up.railway.app"}/auth/github/callback`,
    scope: "read:user",
    state: String(callbackPort), // Pass port through OAuth state param
  });
  res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
});

router.get("/auth/github/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing code parameter" });
    return;
  }
  // Recover callback port from OAuth state param (default 54321)
  const callbackPort = (typeof state === "string" && /^\d{4,5}$/.test(state)) ? state : "54321";

  try {
    // Exchange code for access token
    const tokenRes = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      res.status(400).json({ error: "Failed to obtain access token", detail: tokenData.error });
      return;
    }

    // Fetch GitHub user profile
    const userRes = await fetch(GITHUB_USER_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const ghUser = (await userRes.json()) as {
      id: number;
      login: string;
      avatar_url: string;
      name: string | null;
    };

    // Try to upsert in DB, but don't fail if DB is unavailable
    let userId = String(ghUser.id);
    try {
      const result = await query(
        `INSERT INTO users (github_id, github_username, avatar_url, github_token)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (github_id)
         DO UPDATE SET github_username = EXCLUDED.github_username, avatar_url = EXCLUDED.avatar_url, github_token = EXCLUDED.github_token
         RETURNING id, github_username`,
        [String(ghUser.id), ghUser.login, ghUser.avatar_url, tokenData.access_token],
      );
      userId = result.rows[0].id;
    } catch (dbErr) {
      // DB not available — use GitHub ID as user ID
      console.warn("DB unavailable, using GitHub ID as user ID:", (dbErr as Error).message);
    }

    // Generate short-lived access JWT + long-lived refresh token
    const token = jwt.sign(
      { sub: userId, username: ghUser.login },
      process.env.JWT_SECRET!,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const refreshToken = await createRefreshToken(userId, ghUser.login);

    // Redirect to local callback server with both tokens
    const callbackParams = new URLSearchParams({ token });
    if (refreshToken) callbackParams.set("refresh_token", refreshToken);
    res.redirect(`http://localhost:${callbackPort}/callback?${callbackParams.toString()}`);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ─── User profile endpoint (no DB required) ───
router.get("/api/users/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as {
      sub: string;
      username: string;
    };
    res.json({
      id: payload.sub,
      github_username: payload.username,
      avatar_url: `https://github.com/${payload.username}.png`,
      display_name: null,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// ─── Refresh token endpoint ───
router.post("/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token || typeof refresh_token !== "string") {
    res.status(400).json({ error: "Missing refresh_token" });
    return;
  }

  try {
    await ensureRefreshTable();

    // Validate and consume the refresh token in one atomic query
    const result = await query(
      `UPDATE refresh_tokens
       SET revoked = TRUE
       WHERE token = $1 AND revoked = FALSE AND expires_at > NOW()
       RETURNING user_id, username`,
      [refresh_token],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    const { user_id, username } = result.rows[0];

    // Issue new access JWT + rotated refresh token
    const newAccessToken = jwt.sign(
      { sub: user_id, username },
      process.env.JWT_SECRET!,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const newRefreshToken = await createRefreshToken(user_id, username);

    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken ?? "",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    res.status(500).json({ error: "Refresh failed" });
  }
});

export default router;
