import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig, loadToken } from "./config.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const token = loadToken();

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: token
        ? { Authorization: `Bearer ${token.access_token}` }
        : undefined,
    },
  });

  // If we have a stored session, set it
  if (token) {
    client.auth.setSession({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });
  }

  return client;
}

export function resetClient() {
  client = null;
}
