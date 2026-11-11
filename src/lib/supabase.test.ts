import assert from "node:assert/strict";
import { test } from "node:test";
import { isSupabaseConfigured } from "./supabase";

test("Supabase configuration requires a valid HTTP(S) URL and public key", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "test-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert.equal(isSupabaseConfigured(), true);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "your_supabase_url_here";
    assert.equal(isSupabaseConfigured(), false);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    assert.equal(isSupabaseConfigured(), false);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    if (originalPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = originalPublishableKey;
  }
});
