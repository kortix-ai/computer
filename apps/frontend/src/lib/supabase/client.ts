import { createBrowserClient } from '@supabase/ssr'
import { KORTIX_SUPABASE_AUTH_COOKIE } from './constants'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window !== 'undefined') {
      throw new Error('Missing Supabase browser environment variables');
    }

    return createBrowserClient('https://placeholder.invalid', 'placeholder-anon-key', {
      cookieOptions: {
        name: KORTIX_SUPABASE_AUTH_COOKIE,
        path: '/',
        sameSite: 'lax',
      },
    })
  }

  return createBrowserClient(url, key, {
    cookieOptions: {
      name: KORTIX_SUPABASE_AUTH_COOKIE,
      path: '/',
      sameSite: 'lax',
    },
  })
}
