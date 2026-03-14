import { apiFetch } from "../../shared/api-client.js";

interface PingPayload {
  from_username: string;
  from_id: string;
  to_username: string;
  message: string;
  timestamp: string;
}

export async function pingUser(
  targetUsername: string,
  message?: string,
  roomSlug?: string
): Promise<{ delivered: boolean; method: string }> {
  await apiFetch("/api/pings", {
    method: "POST",
    body: JSON.stringify({
      username: targetUsername,
      message: message || `Hey ${targetUsername}!`,
      slug: roomSlug || null,
    }),
  });
  return { delivered: true, method: "socket" };
}

export async function getPendingPings(): Promise<PingPayload[]> {
  const data = await apiFetch("/api/pings") as any[];
  return data.map((row) => ({
    from_username: row.from_username,
    from_id: row.id,
    to_username: "",
    message: row.message,
    timestamp: row.created_at,
  }));
}
