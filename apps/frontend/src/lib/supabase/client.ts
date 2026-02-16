import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // In local mode Supabase is unused — pass dummy values to suppress the
  // "@supabase/ssr: URL and API key are required" console error.
  const isLocal = process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local';
  const url = isLocal
    ? (process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321')
    : process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = isLocal
    ? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'local-mode-no-key')
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(url, key)
}
