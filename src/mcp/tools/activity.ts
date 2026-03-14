import { apiFetch } from "../../shared/api-client.js";
import type { Activity } from "../../shared/types.js";

export async function postActivity(
  roomSlug: string,
  action: string,
  detail?: string,
  _persist: boolean = false
): Promise<void> {
  await apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/activities`, {
    method: "POST",
    body: JSON.stringify({ action, detail: detail || null }),
  });
}

export async function getActivityHistory(
  roomSlug: string,
  limit: number = 20
): Promise<Activity[]> {
  return apiFetch(`/api/rooms/${encodeURIComponent(roomSlug)}/activities?limit=${limit}`);
}
