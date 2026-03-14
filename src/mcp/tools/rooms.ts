import type { Room } from "../../shared/types.js";

const MIGRATION_ERROR = "Not yet migrated to Express server";

export async function createRoom(_name: string): Promise<Room> {
  throw new Error(MIGRATION_ERROR);
}

export async function joinRoom(_slug: string): Promise<Room> {
  throw new Error(MIGRATION_ERROR);
}

export async function leaveRoom(_slug: string): Promise<void> {
  throw new Error(MIGRATION_ERROR);
}

export async function listRooms(): Promise<
  (Room & { member_count: number })[]
> {
  throw new Error(MIGRATION_ERROR);
}

export async function myRooms(): Promise<Room[]> {
  throw new Error(MIGRATION_ERROR);
}
