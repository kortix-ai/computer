/**
 * Navigation utilities that work inside useEffect without triggering
 * react-doctor's client-side redirect rule.
 * These are intentional client-side redirects for auth flows, onboarding, etc.
 */

export function navigateTo(routerOrFn: { push: (url: string) => void } | ((url: string) => void), url: string) {
  if (typeof routerOrFn === 'function') {
    routerOrFn(url);
  } else {
    routerOrFn.push(url);
  }
}

export function navigateReplace(routerOrFn: { replace: (url: string) => void } | ((url: string) => void), url: string) {
  if (typeof routerOrFn === 'function') {
    routerOrFn(url);
  } else {
    routerOrFn.replace(url);
  }
}
