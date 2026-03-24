import { getSocket, getJoinedRooms } from "./_socket.js";
import { loadToken } from "../../shared/config.js";

/**
 * Announce a ship (deploy, release, merge) to the squad.
 */
export async function announceShip(
  roomSlug: string,
  message: string
): Promise<string> {
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  if (!getJoinedRooms().has(roomSlug)) {
    throw new Error(`Not in room "${roomSlug}". Join first.`);
  }

  const socket = await getSocket();
  socket.emit("ship", {
    slug: roomSlug,
    commitMessage: message,
    isManual: true,
  });

  return `Shipped! Your squad has been notified: "${message}"`;
}
