import posthog from 'posthog-js';

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: 'https://eu.posthog.com',
    defaults: '2025-05-24',
    capture_exceptions: true, 
    // Disable debug mode to suppress noisy PostHog retry logs in dev console
    // (ERR_BLOCKED_BY_CLIENT from ad blockers causes endless retry spam)
    debug: false,
    // Use localStorage only to avoid cookie header size issues (431 errors)
    // This prevents PostHog from storing data in cookies, which can cause headers to exceed size limits
    persistence: 'localStorage',
    // Disable session recording to reduce data storage
    disable_session_recording: true,
  });
}
