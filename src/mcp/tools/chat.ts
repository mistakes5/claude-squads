import { apiFetch } from "../../shared/api-client.js";
import type { Message } from "../../shared/types.js";

export async function sendMessage(
  roomSlug: string,
  content: string
): Promise<{ username: string; content: string }> {
  const msg = await apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return { username: msg.github_username, content: msg.content };
}

export async function getMessages(
  roomSlug: string,
  _limit: number = 20
): Promise<Message[]> {
  return apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/messages`);
}
