import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale, type Locale } from '@/i18n/config';
import { detectBestLocaleFromHeaders } from '@/lib/utils/geo-detection-server';

// Marketing pages that support locale routing for SEO (/de, /it, etc.)
const MARKETING_ROUTES = [
  '/',
  '/legal',
  '/support',
  '/templates',
];

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/', // Homepage should be public!
  '/auth',
  '/auth/callback',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/legal',
  '/api/auth',
  '/share', // Shared content should be public
  '/templates', // Template pages should be public
  '/master-login', // Master password admin login
  '/checkout', // Public checkout wrapper for Apple compliance
  '/support', // Support page should be public
  '/help', // Help center and documentation should be public
  '/credits-explained', // Credits explained page should be public
  '/about', // About page should be public 
  '/milano', // Milano page should be public
  '/berlin', // Berlin page should be public
  '/app', // App download page should be public,
  '/careers',
  '/pricing', // Pricing page should be public
  '/tutorials', // Tutorials page should be public
  '/enterprise', // Enterprise page should be public
  '/countryerror', // Country restriction error page should be public
  ...locales.flatMap(locale => MARKETING_ROUTES.map(route => `/${locale}${route === '/' ? '' : route}`)),
];

// Routes that require authentication but are related to billing/trials/setup
const BILLING_ROUTES = [
  '/activate-trial',
  '/subscription',
  '/setting-up',
];

// Routes that require authentication and active subscription
const PROTECTED_ROUTES = [
  '/dashboard',
  '/agents',
  '/projects',
  '/workspace',
  '/settings',
];

// App store links for mobile redirect
const APP_STORE_LINKS = {
  ios: 'https://apps.apple.com/ie/app/kortix/id6754448524',
  android: 'https://play.google.com/store/apps/details?id=com.kortix.app',
};

// Detect mobile platform from User-Agent header (edge-optimized)
function detectMobilePlatformFromUA(userAgent: string | null): 'ios' | 'android' | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 🚀 HYPER-FAST: Mobile app store redirect for /milano, /berlin, and /app
  // This runs at the edge before ANY page rendering
  if (pathname === '/milano' || pathname === '/berlin' || pathname === '/app') {
    const userAgent = request.headers.get('user-agent');
    const platform = detectMobilePlatformFromUA(userAgent);
    
    if (platform) {
      // Instant 302 redirect to app store - no page load needed
      return NextResponse.redirect(APP_STORE_LINKS[platform], { status: 302 });
    }
    // Desktop users continue to the full page
  }

  // Block access to WIP /thread/new route - redirect to dashboard
  if (pathname.includes('/thread/new')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next();
  }

  // Handle Supabase verification redirects at root level
  // Supabase sometimes redirects to root (/) instead of /auth/callback
  // Detect authentication parameters and redirect to proper callback handler
  if (pathname === '/' || pathname === '') {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    const error = searchParams.get('error');
    
    // If we have Supabase auth parameters, redirect to /auth/callback
    // Note: Mobile apps use direct deep links and bypass this route
    if (code || token || type || error) {
      const callbackUrl = new URL('/auth/callback', request.url);
      
      // Preserve all query parameters
      searchParams.forEach((value, key) => {
        callbackUrl.searchParams.set(key, value);
      });
      
      console.log('🔄 Redirecting Supabase verification from root to /auth/callback');
      return NextResponse.redirect(callbackUrl);
    }
  }

  // Extract path segments
  const pathSegments = pathname.split('/').filter(Boolean);
  const firstSegment = pathSegments[0];
  
  // Check if first segment is a locale (e.g., /de, /it)
  if (firstSegment && locales.includes(firstSegment as Locale)) {
    const locale = firstSegment as Locale;
    const remainingPath = '/' + pathSegments.slice(1).join('/') || '/';
    
    // Verify remaining path is a marketing route
    const isRemainingPathMarketing = MARKETING_ROUTES.some(route => {
      if (route === '/') {
        return remainingPath === '/' || remainingPath === '';
      }
      return remainingPath === route || remainingPath.startsWith(route + '/');
    });
    
    if (isRemainingPathMarketing) {
      // Rewrite /de to /, etc.
      const response = NextResponse.rewrite(new URL(remainingPath, request.url));
      response.cookies.set('locale', locale, {
        path: '/',
        maxAge: 31536000, // 1 year
        sameSite: 'lax',
      });
      
      // Store locale in headers so next-intl can pick it up
      response.headers.set('x-locale', locale);
      
      return response;
    }
  }
  
  // Check if this is a marketing route (without locale prefix)
  const isMarketingRoute = MARKETING_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );

  // Create a single Supabase client instance that we'll reuse
  let supabaseResponse = NextResponse.next({
    request,
  });

  // IMPORTANT: NEXT_PUBLIC_ vars are inlined at build time by Next.js, so in
  // Docker containers they contain placeholder values. We MUST use runtime
  // env vars (SUPABASE_URL, SUPABASE_ANON_KEY) with fallback to NEXT_PUBLIC_.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Fetch user ONCE and reuse for both locale detection and auth checks
  let user: { id: string; user_metadata?: { locale?: string } } | null = null;
  let authError: Error | null = null;
  
  try {
    const { data: { user: fetchedUser }, error: fetchedError } = await supabase.auth.getUser();
    user = fetchedUser;
    authError = fetchedError as Error | null;
  } catch (error) {
    // User might not be authenticated, continue
    authError = error as Error;
  }

  // Auto-redirect based on geo-detection for marketing pages
  // Only redirect if:
  // 1. User is visiting a marketing route without locale prefix
  // 2. User doesn't have an explicit preference (no cookie, no user metadata)
  // 3. Detected locale is not English (default)
  if (isMarketingRoute && (!firstSegment || !locales.includes(firstSegment as Locale))) {
    // Check if user has explicit preference in cookie
    const localeCookie = request.cookies.get('locale')?.value;
    const hasExplicitPreference = !!localeCookie && locales.includes(localeCookie as Locale);
    
    // Check user metadata (if authenticated) - reuse the user we already fetched
    let userLocale: Locale | null = null;
    if (!hasExplicitPreference && user?.user_metadata?.locale && locales.includes(user.user_metadata.locale as Locale)) {
      userLocale = user.user_metadata.locale as Locale;
    }
    
    // Only auto-redirect if:
    // - No explicit preference (no cookie, no user metadata)
    // - Detected locale is not English (default)
    // This prevents unnecessary redirects for English speakers and users with preferences
    if (!hasExplicitPreference && !userLocale) {
      const acceptLanguage = request.headers.get('accept-language');
      
      const detectedLocale = detectBestLocaleFromHeaders(acceptLanguage);
      
      // Only redirect if detected locale is not English (default)
      // This prevents unnecessary redirects for English speakers
      if (detectedLocale !== defaultLocale) {
        const redirectUrl = new URL(request.url);
        redirectUrl.pathname = `/${detectedLocale}${pathname === '/' ? '' : pathname}`;
        
        const redirectResponse = NextResponse.redirect(redirectUrl);
        // Set cookie so we don't redirect again on next visit
        redirectResponse.cookies.set('locale', detectedLocale, {
          path: '/',
          maxAge: 31536000, // 1 year
          sameSite: 'lax',
        });
        return redirectResponse;
      }
    }
  }

  // Allow all public routes — but return supabaseResponse (not NextResponse.next())
  // so that any cookie updates from getUser() token refresh are preserved.
  // Returning a fresh NextResponse.next() would discard refreshed auth cookies,
  // causing the session to break on the next navigation.
  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return supabaseResponse;
  }

  // Everything else requires authentication - reuse the user we already fetched
  try {
    
    // Redirect to auth if not authenticated (using the user we already fetched)
    if (authError || !user) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    // Skip billing checks when billing is not enabled (self-hosted deployments)
    const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
    if (!billingEnabled) {
      return supabaseResponse;
    }

    // Skip billing checks for billing-related routes
    if (BILLING_ROUTES.some(route => pathname.startsWith(route))) {
      return supabaseResponse;
    }

    // Only check billing for protected routes that require active subscription
    // Calls the backend API (which has direct DB access) instead of querying
    // Supabase PostgREST — PostgREST only exposes whitelisted schemas.
    if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
      // If user is coming from Stripe checkout with subscription=success, allow access
      // The webhook might not have processed yet
      const subscriptionSuccess = request.nextUrl.searchParams.get('subscription') === 'success';
      if (subscriptionSuccess && pathname === '/dashboard') {
        return supabaseResponse;
      }

      // Get the user's session token to authenticate with the backend
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || '';
      if (!backendUrl || !accessToken) {
        // Can't reach backend — let the request through, client-side will handle it
        return supabaseResponse;
      }

      try {
        // NEXT_PUBLIC_BACKEND_URL may already include /v1 (e.g. https://api.kortix.com/v1)
        const apiBase = backendUrl.replace(/\/v1\/?$/, '');
        const accountStateRes = await fetch(`${apiBase}/v1/billing/account-state`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!accountStateRes.ok) {
          // Backend error (not network) — redirect to setting-up as fallback
          const url = request.nextUrl.clone();
          url.pathname = '/setting-up';
          return NextResponse.redirect(url);
        }

        const accountState = await accountStateRes.json() as {
          subscription?: { tier_key?: string; status?: string };
          credits?: { can_run?: boolean };
          tier?: { name?: string };
        };

        const tierKey = accountState?.subscription?.tier_key || accountState?.tier?.name || '';
        const hasPaidTier = tierKey && tierKey !== 'none' && tierKey !== 'free';
        const hasFreeTier = tierKey === 'free';
        const isActive = accountState?.subscription?.status === 'active' || accountState?.subscription?.status === 'trialing';

        if (hasPaidTier || hasFreeTier || isActive) {
          return supabaseResponse;
        }

        // No subscription at all — redirect to setting-up (triggers account initialization)
        const url = request.nextUrl.clone();
        url.pathname = '/setting-up';
        return NextResponse.redirect(url);
      } catch {
        // Network error / timeout — redirect to setting-up as fallback
        const url = request.nextUrl.clone();
        url.pathname = '/setting-up';
        return NextResponse.redirect(url);
      }
    }

    return supabaseResponse;
  } catch (error) {
    console.error('Middleware error:', error);
    return supabaseResponse;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - root path (/)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}; 