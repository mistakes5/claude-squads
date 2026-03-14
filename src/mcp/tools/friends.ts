import { getSupabase } from "../../shared/supabase.js";
import type { User } from "../../shared/types.js";

interface FriendEntry {
  user: User;
  status: "pending" | "accepted";
  direction: "sent" | "received";
}

export async function addFriend(githubUsername: string): Promise<void> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  // Find user by GitHub username
  const { data: friend } = await supabase
    .from("users")
    .select("id")
    .eq("github_username", githubUsername)
    .single();

  if (!friend) {
    throw new Error(
      `User "${githubUsername}" not found. They need to log in to Squads first.`
    );
  }

  if (friend.id === user.id) {
    throw new Error("You can't add yourself as a friend!");
  }

  const { error } = await supabase
    .from("friends")
    .upsert({ user_id: user.id, friend_id: friend.id, status: "pending" });

  if (error) throw new Error(`Failed to add friend: ${error.message}`);
}

export async function acceptFriend(githubUsername: string): Promise<void> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { data: friend } = await supabase
    .from("users")
    .select("id")
    .eq("github_username", githubUsername)
    .single();

  if (!friend) throw new Error(`User "${githubUsername}" not found`);

  const { error } = await supabase
    .from("friends")
    .update({ status: "accepted" })
    .eq("user_id", friend.id)
    .eq("friend_id", user.id);

  if (error) throw new Error(`Failed to accept friend: ${error.message}`);

  // Create the reverse friendship too
  await supabase
    .from("friends")
    .upsert({ user_id: user.id, friend_id: friend.id, status: "accepted" });
}

export async function listFriends(): Promise<FriendEntry[]> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  // Get friends where I'm the sender
  const { data: sent } = await supabase
    .from("friends")
    .select("status, friend:users!friends_friend_id_fkey(*)")
    .eq("user_id", user.id);

  // Get friends where I'm the receiver
  const { data: received } = await supabase
    .from("friends")
    .select("status, friend:users!friends_user_id_fkey(*)")
    .eq("friend_id", user.id);

  const friends: FriendEntry[] = [];

  for (const s of sent ?? []) {
    if (s.friend) {
      friends.push({
        user: s.friend as any,
        status: s.status as "pending" | "accepted",
        direction: "sent",
      });
    }
  }

  for (const r of received ?? []) {
    if (r.friend) {
      friends.push({
        user: r.friend as any,
        status: r.status as "pending" | "accepted",
        direction: "received",
      });
    }
  }

  // Deduplicate (if both directions exist for accepted friends)
  const seen = new Set<string>();
  return friends.filter((f) => {
    if (f.status === "accepted" && seen.has(f.user.id)) return false;
    seen.add(f.user.id);
    return true;
  });
}
