import type { PresenceState } from "../../shared/types.js";

const MIGRATION_ERROR = "Not yet migrated to Express server";

export async function trackPresence(
  _roomSlug: string,
  _status: string = "online"
): Promise<void> {
  throw new Error(MIGRATION_ERROR);
}

export async function updateStatus(
  _roomSlug: string,
  _status: string,
  _currentFile?: string
): Promise<void> {
  throw new Error(MIGRATION_ERROR);
}

export function getPresence(_roomSlug: string): PresenceState[] {
  return [];
}

export async function untrackPresence(_roomSlug: string): Promise<void> {
  // no-op
}

export function getActiveChannels(): Map<string, any> {
  return new Map();
}
