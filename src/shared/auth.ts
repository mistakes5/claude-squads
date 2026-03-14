import { createServer } from "http";
import { saveToken, clearToken } from "./config.js";
import type { StoredToken } from "./types.js";

const CALLBACK_PORT = 54321;

// Track the active callback server so we can tear it down
let activeServer: ReturnType<typeof createServer> | null = null;

/**
 * Get the Squade server URL from env, with fallback.
 */
function getServerUrl(): string {
  return process.env.SQUADS_SERVER_URL ?? "http://localhost:3000";
}

/**
 * Opens the browser for GitHub OAuth via our Express server
 * and waits for the JWT callback.
 */
export async function login(): Promise<StoredToken["user"]> {
  const serverUrl = getServerUrl();
  const authUrl = `${serverUrl}/auth/github`;

  // Open browser to our server's GitHub OAuth endpoint
  const openModule = await import("open");
  await openModule.default(authUrl);

  // Wait for callback with JWT
  const tokenData = await waitForCallback();
  return tokenData.user;
}

function waitForCallback(): Promise<StoredToken> {
  // Kill any lingering server from a previous attempt
  if (activeServer) {
    try { activeServer.close(); } catch {}
    activeServer = null;
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      if (activeServer === server) activeServer = null;
      try { server.close(); } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Login timed out after 120 seconds"));
    }, 120_000);

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const jwt = url.searchParams.get("token");
      if (!jwt) {
        res.writeHead(400);
        res.end("Missing token parameter");
        return;
      }

      try {
        // Decode the JWT payload (no verification needed — we trust our own server)
        const payload = JSON.parse(
          Buffer.from(jwt.split(".")[1], "base64").toString()
        );

        // Fetch full user profile from our server
        const serverUrl = getServerUrl();
        const userRes = await fetch(`${serverUrl}/api/users/me`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });

        let username = payload.username || "unknown";
        let avatarUrl: string | null = null;
        let displayName: string | null = null;

        if (userRes.ok) {
          const userData = (await userRes.json()) as {
            github_username?: string;
            avatar_url?: string;
            display_name?: string;
          };
          username = userData.github_username || username;
          avatarUrl = userData.avatar_url || null;
          displayName = userData.display_name || null;
        } else {
          // Fallback: use GitHub API for avatar
          avatarUrl = `https://github.com/${username}.png`;
        }

        const token: StoredToken = {
          access_token: jwt,
          refresh_token: "", // Not used with JWT auth
          expires_at: payload.exp || 0,
          user: {
            id: payload.sub,
            github_username: username,
            display_name: displayName,
            avatar_url: avatarUrl,
          },
        };

        saveToken(token);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0d1117; color: #e6edf3;">
              <div style="text-align: center;">
                <h1>Welcome to Squade Code!</h1>
                <p>Logged in as <strong>${username}</strong>. You can close this tab.</p>
              </div>
            </body>
          </html>
        `);

        cleanup();
        resolve(token);
      } catch (err) {
        res.writeHead(500);
        res.end("Auth failed");
        cleanup();
        reject(err);
      }
    });

    // Handle port-in-use gracefully instead of crashing
    server.on("error", (err: NodeJS.ErrnoException) => {
      cleanup();
      if (err.code === "EADDRINUSE") {
        reject(new Error("Login already in progress — please wait or restart the app"));
      } else {
        reject(err);
      }
    });

    activeServer = server;
    server.listen(CALLBACK_PORT);
  });
}

export function logout() {
  closeActiveServer();
  clearToken();
}

/**
 * Closes the active OAuth callback server if one is running.
 */
export function closeActiveServer() {
  if (activeServer) {
    try { activeServer.close(); } catch {}
    activeServer = null;
  }
}
