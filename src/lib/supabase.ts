import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | undefined;

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const url = new URL(supabaseUrl);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
  } catch {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}

function getSupabaseClient() {
  if (client) return client;

  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL to a valid HTTP(S) URL and configure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }

  client = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
