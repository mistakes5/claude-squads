import type { Message } from "../../shared/types.js";

const MIGRATION_ERROR = "Not yet migrated to Express server";

export async function sendMessage(
  _roomSlug: string,
  _content: string
): Promise<{ username: string; content: string }> {
  throw new Error(MIGRATION_ERROR);
}

export async function getMessages(
  _roomSlug: string,
  _limit: number = 20
): Promise<Message[]> {
  throw new Error(MIGRATION_ERROR);
}
