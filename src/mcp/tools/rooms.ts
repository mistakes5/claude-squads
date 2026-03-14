import { getSupabase } from "../../shared/supabase.js";
import type { Room } from "../../shared/types.js";

export async function createRoom(name: string): Promise<Room> {
  const supabase = getSupabase();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({ name, slug, created_by: user.id })
    .select()
    .single();

  if (error) throw new Error(`Failed to create room: ${error.message}`);

  // Auto-join the creator
  await supabase
    .from("room_members")
    .insert({ room_id: room.id, user_id: user.id });

  return room;
}

export async function joinRoom(slug: string): Promise<Room> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { data: room, error: findError } = await supabase
    .from("rooms")
    .select()
    .eq("slug", slug)
    .single();

  if (findError || !room) throw new Error(`Room "${slug}" not found`);

  // Check if already a member
  const { data: existing } = await supabase
    .from("room_members")
    .select("room_id")
    .eq("room_id", room.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: joinError } = await supabase
      .from("room_members")
      .insert({ room_id: room.id, user_id: user.id });

    if (joinError) throw new Error(`Failed to join: ${joinError.message}`);
  }

  return room;
}

export async function leaveRoom(slug: string): Promise<void> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { data: room } = await supabase
    .from("rooms")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!room) throw new Error(`Room "${slug}" not found`);

  await supabase
    .from("room_members")
    .delete()
    .eq("room_id", room.id)
    .eq("user_id", user.id);
}

export async function listRooms(): Promise<
  (Room & { member_count: number })[]
> {
  const supabase = getSupabase();

  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("*, room_members(count)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to list rooms: ${error.message}`);

  return (rooms ?? []).map((r: any) => ({
    ...r,
    member_count: r.room_members?.[0]?.count ?? 0,
  }));
}

export async function myRooms(): Promise<Room[]> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { data, error } = await supabase
    .from("room_members")
    .select("rooms(*)")
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to get rooms: ${error.message}`);

  return (data ?? []).map((d: any) => d.rooms).filter(Boolean);
}
