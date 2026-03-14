import { apiFetch } from "../../shared/api-client.js";
import type { User } from "../../shared/types.js";

interface FriendEntry {
  user: User;
  status: "pending" | "accepted";
  direction: "sent" | "received";
}

export async function addFriend(githubUsername: string): Promise<void> {
  await apiFetch("/api/friends", {
    method: "POST",
    body: JSON.stringify({ username: githubUsername }),
  });
}

export async function acceptFriend(githubUsername: string): Promise<void> {
  await apiFetch(`/api/friends/${encodeURIComponent(githubUsername)}/accept`, {
    method: "POST",
  });
}

export async function listFriends(): Promise<FriendEntry[]> {
  const data = await apiFetch("/api/friends") as any[];
  return data.map((row) => ({
    user: {
      id: row.friend_id,
      github_id: "",
      github_username: row.github_username,
      avatar_url: row.avatar_url || null,
      created_at: row.created_at || "",
    },
    status: row.status,
    direction: row.direction === "outgoing" ? "sent" : "received",
  }));
}
