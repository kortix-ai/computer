import { createBrowserClient } from '@supabase/ssr'
import { KORTIX_SUPABASE_AUTH_COOKIE } from './constants'

export function createClient() {
  // Supabase is required in all modes (local dev uses `supabase start`).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(url, key, {
    cookieOptions: {
      name: KORTIX_SUPABASE_AUTH_COOKIE,
      path: '/',
      sameSite: 'lax',
    },
  })
}
