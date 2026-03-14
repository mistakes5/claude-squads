/**
 * API client for the Squade Express server.
 * Replaces the old Supabase client throughout the codebase.
 */
import { loadToken, getServerUrl } from "./config.js";

export function getAuthHeaders(): Record<string, string> {
  const token = loadToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token}` };
}

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
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
