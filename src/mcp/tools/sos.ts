import { getSocket, getJoinedRooms } from "./_socket.js";
import { loadToken } from "../../shared/config.js";

/**
 * Send an SOS help request to the squad with error context.
 */
export async function sendSos(
  roomSlug: string,
  description: string,
  error?: string,
  currentFile?: string
): Promise<string> {
  const token = loadToken();
  if (!token) throw new Error("Not logged in");

  if (!getJoinedRooms().has(roomSlug)) {
    throw new Error(`Not in room "${roomSlug}". Join first.`);
  }

  const socket = await getSocket();

  // Try to detect git branch
  let gitBranch: string | null = null;
  try {
    const { execSync } = await import("child_process");
    gitBranch = execSync("git branch --show-current 2>/dev/null", { encoding: "utf-8" }).trim() || null;
  } catch {}

  socket.emit("sos-ping", {
    slug: roomSlug,
    description,
    error: error || null,
    currentFile: currentFile || null,
    gitBranch,
  });

  return `SOS sent to your squad! They'll see your error context and can help debug.`;
}
