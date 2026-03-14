import { apiFetch } from "../../shared/api-client.js";
import type { Room } from "../../shared/types.js";

export async function createRoom(name: string): Promise<Room> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return apiFetch("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name, slug }),
  });
}

export async function joinRoom(slug: string): Promise<Room> {
  await apiFetch(`/api/rooms/${encodeURIComponent(slug)}/join`, {
    method: "POST",
  });
  return apiFetch(`/api/rooms/${encodeURIComponent(slug)}`);
}

export async function leaveRoom(slug: string): Promise<void> {
  await apiFetch(`/api/rooms/${encodeURIComponent(slug)}/leave`, {
    method: "DELETE",
  });
}

export async function listRooms(): Promise<(Room & { member_count: number })[]> {
  return apiFetch("/api/rooms");
}

export async function myRooms(): Promise<Room[]> {
  return apiFetch("/api/rooms/mine");
}
