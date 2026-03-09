import * as React from 'react';
import { isMobileDevice } from '@/lib/utils/is-mobile-device';

const MOBILE_BREAKPOINT = 1024;

function subscribeToViewport(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', callback);
  window.addEventListener('resize', callback, { passive: true });

  return () => {
    mql.removeEventListener('change', callback);
    window.removeEventListener('resize', callback);
  };
}

function getMobileViewportSnapshot() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.innerWidth < MOBILE_BREAKPOINT;
}

function subscribeToUserAgent() {
  return () => {};
}

function getMobileDeviceSnapshot() {
  return isMobileDevice();
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToViewport,
    getMobileViewportSnapshot,
    () => false,
  );
}

export function useIsMobileDevice() {
  return React.useSyncExternalStore(
    subscribeToUserAgent,
    getMobileDeviceSnapshot,
    () => false,
  );
}
