import { createServer } from "http";
import { getSupabase, resetClient } from "./supabase.js";
import { saveToken, clearToken } from "./config.js";
import type { StoredToken } from "./types.js";

const CALLBACK_PORT = 54321;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

// Track the active callback server so we can tear it down
let activeServer: ReturnType<typeof createServer> | null = null;

/**
 * Opens the browser for GitHub OAuth and waits for the callback.
 * Returns the authenticated user info.
 */
export async function login(): Promise<StoredToken["user"]> {
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    throw new Error(`OAuth init failed: ${error?.message ?? "no URL"}`);
  }

  // Open browser
  const openModule = await import("open");
  await openModule.default(data.url);

  // Wait for callback
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

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing code parameter");
        return;
      }

      try {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error || !data.session) {
          throw new Error(error?.message ?? "Failed to exchange code");
        }

        const githubUsername =
          data.user.user_metadata?.user_name ??
          data.user.user_metadata?.preferred_username ??
          "unknown";
        const displayName =
          data.user.user_metadata?.name ??
          data.user.user_metadata?.full_name ??
          null;
        const avatarUrl = data.user.user_metadata?.avatar_url ?? null;

        await supabase.from("users").upsert(
          {
            id: data.user.id,
            github_id: data.user.user_metadata?.provider_id ?? data.user.id,
            github_username: githubUsername,
            avatar_url: avatarUrl,
          },
          { onConflict: "github_id" }
        );

        const token: StoredToken = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at ?? 0,
          user: {
            id: data.user.id,
            github_username: githubUsername,
            display_name: displayName,
            avatar_url: avatarUrl,
          },
        };

        saveToken(token);
        resetClient();

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0d1117; color: #e6edf3;">
              <div style="text-align: center;">
                <h1>Welcome to Squade Code!</h1>
                <p>Logged in as <strong>${githubUsername}</strong>. You can close this tab.</p>
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
  resetClient();
}

/**
 * Closes the active OAuth callback server if one is running.
 * Useful for cleanup on app quit or when cancelling an in-progress login.
 */
export function closeActiveServer() {
  if (activeServer) {
    try { activeServer.close(); } catch {}
    activeServer = null;
  }
}
