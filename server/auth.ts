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
    };

    // Upsert user in database
    const result = await query(
      `INSERT INTO users (github_id, github_username, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (github_id)
       DO UPDATE SET github_username = EXCLUDED.github_username, avatar_url = EXCLUDED.avatar_url
       RETURNING id, github_username`,
      [String(ghUser.id), ghUser.login, ghUser.avatar_url],
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { sub: user.id, username: user.github_username },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    // Redirect to Electron app callback
    res.redirect(`http://localhost:54321/callback?token=${token}`);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

export default router;
