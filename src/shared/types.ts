export interface User {
  id: string;
  github_id: string;
  github_username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  is_public: boolean;
  created_at: string;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  joined_at: string;
  users?: User;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  users?: User;
}

export interface Activity {
  id: string;
  room_id: string;
  user_id: string;
  action: string;
  detail: string | null;
  created_at: string;
  users?: User;
}

export interface Friend {
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted";
  created_at: string;
  users?: User;
}

export interface PresenceState {
  github_username: string;
  avatar_url: string | null;
  status: string;
  current_file: string | null;
  online_at: string;
}

export interface SquadsConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    github_username: string;
    avatar_url: string | null;
  };
}

export type OverlayMode = "always" | "toggle" | "notifications";

export interface SquadsSettings {
  overlay_mode: OverlayMode;
  current_room: string | null;
}
