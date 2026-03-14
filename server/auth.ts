import { Router } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db.js";

const router = Router();

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

router.get("/auth/github", (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${process.env.SQUADS_SERVER_URL ?? `http://localhost:${process.env.PORT ?? 3000}`}/auth/github/callback`,
    scope: "read:user",
  });
  res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
});

router.get("/auth/github/callback", async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing code parameter" });
    return;
  }

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
        `INSERT INTO users (github_id, github_username, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (github_id)
         DO UPDATE SET github_username = EXCLUDED.github_username, avatar_url = EXCLUDED.avatar_url
         RETURNING id, github_username`,
        [String(ghUser.id), ghUser.login, ghUser.avatar_url],
      );
      userId = result.rows[0].id;
    } catch (dbErr) {
      // DB not available — use GitHub ID as user ID
      console.warn("DB unavailable, using GitHub ID as user ID:", (dbErr as Error).message);
    }

    // Generate JWT
    const token = jwt.sign(
      { sub: userId, username: ghUser.login },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    // Redirect to Electron app's local callback server
    res.redirect(`http://localhost:54321/callback?token=${token}`);
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
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
