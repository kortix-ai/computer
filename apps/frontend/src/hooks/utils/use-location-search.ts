import * as React from 'react';

const LOCATION_SEARCH_CHANGE_EVENT = 'location-search-change';

function dispatchLocationSearchChange() {
  window.dispatchEvent(new Event(LOCATION_SEARCH_CHANGE_EVENT));
}

function patchHistoryMethods() {
  if (typeof window === 'undefined') {
    return;
  }

  const historyWithPatch = window.history as History & {
    __locationSearchPatched__?: boolean;
  };

  if (historyWithPatch.__locationSearchPatched__) {
    return;
  }

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function pushState(...args) {
    originalPushState(...args);
    dispatchLocationSearchChange();
  };

  window.history.replaceState = function replaceState(...args) {
    originalReplaceState(...args);
    dispatchLocationSearchChange();
  };

  historyWithPatch.__locationSearchPatched__ = true;
}

function subscribeToLocationSearch(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  patchHistoryMethods();

  window.addEventListener('popstate', callback);
  window.addEventListener(LOCATION_SEARCH_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(LOCATION_SEARCH_CHANGE_EVENT, callback);
  };
}

function getLocationSearchSnapshot() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.search;
}

export function useLocationSearch() {
  return React.useSyncExternalStore(
    subscribeToLocationSearch,
    getLocationSearchSnapshot,
    () => '',
  );
}
