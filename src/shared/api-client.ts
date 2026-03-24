/**
 * API client for the Squade Express server.
 * Auto-refreshes expired access tokens using the stored refresh token.
 */
import { loadToken, saveToken, getServerUrl, isTokenExpiringSoon } from "./config.js";
import type { StoredToken } from "./types.js";

// Mutex to prevent concurrent refresh attempts
let refreshPromise: Promise<StoredToken | null> | null = null;

export function getAuthHeaders(): Record<string, string> {
  const token = loadToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token}` };
}

/**
 * Refreshes the access token using the stored refresh token.
 * Returns the updated StoredToken, or null if refresh failed.
 */
export async function refreshAccessToken(): Promise<StoredToken | null> {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const token = loadToken();
    if (!token?.refresh_token) return null;

    try {
      const res = await fetch(`${getServerUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: token.refresh_token }),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
      };

      const updated: StoredToken = {
        ...token,
        access_token: data.access_token,
        refresh_token: data.refresh_token || token.refresh_token,
        expires_at: data.expires_at,
      };

      saveToken(updated);
      return updated;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Ensures the current token is fresh. Refreshes proactively if near expiry.
 * Returns valid auth headers, or empty if no token / refresh failed.
 */
async function getFreshAuthHeaders(): Promise<Record<string, string>> {
  let token = loadToken();
  if (!token) return {};

  if (isTokenExpiringSoon(token)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) token = refreshed;
    // If refresh failed but token isn't fully expired yet, try anyway
  }

  return { Authorization: `Bearer ${token.access_token}` };
}

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const url = `${getServerUrl()}${path}`;
  const authHeaders = await getFreshAuthHeaders();

  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(opts.headers || {}),
    },
  });

  // On 401, try refreshing once and retry
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryRes = await fetch(url, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshed.access_token}`,
          ...(opts.headers || {}),
        },
      });
      if (!retryRes.ok) {
        const body = await retryRes.text();
        throw new Error(`API ${retryRes.status}: ${body}`);
      }
      return retryRes.json();
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}
