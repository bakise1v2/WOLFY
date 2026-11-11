import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | undefined;

function getAdminConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase Dashboard > Settings > API > service_role key"
    );
  }
  return { supabaseUrl, serviceRoleKey };
}

function getSupabaseAdminClient() {
  if (client) return client;
  const { supabaseUrl, serviceRoleKey } = getAdminConfig();
  client = createClient<Database>(supabaseUrl, serviceRoleKey);
  return client;
}

export function ensureAdminClient() {
  getAdminConfig();
}

export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property) {
    const client = getSupabaseAdminClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
