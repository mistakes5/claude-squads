import type { User } from "../../shared/types.js";

interface FriendEntry {
  user: User;
  status: "pending" | "accepted";
  direction: "sent" | "received";
}

const MIGRATION_ERROR = "Not yet migrated to Express server";

export async function addFriend(_githubUsername: string): Promise<void> {
  throw new Error(MIGRATION_ERROR);
}

export async function acceptFriend(_githubUsername: string): Promise<void> {
  throw new Error(MIGRATION_ERROR);
}

export async function listFriends(): Promise<FriendEntry[]> {
  throw new Error(MIGRATION_ERROR);
}
