import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Sandbox Auth Store — manages the optional SANDBOX_AUTH_TOKEN for local/VPS mode.
 *
 * When the backend's SANDBOX_AUTH_TOKEN is configured, all requests through the
 * proxy require this token. The frontend detects 401 responses with
 * `authType: 'sandbox_token'` and prompts the user to enter it.
 *
 * The token is persisted in localStorage so it survives page reloads.
 */

interface SandboxAuthStore {
  /** The sandbox access token entered by the user. null = not set. */
  sandboxToken: string | null;
  /** True when we received a 401 with authType=sandbox_token and need user input. */
  needsAuth: boolean;
  /** True while token is being generated — suppresses needsAuth prompts. */
  isGenerating: boolean;
  /** Set the sandbox token (user entered it in the dialog). */
  setSandboxToken: (token: string) => void;
  /** Clear the stored token (e.g. on sign out or token change). */
  clearSandboxToken: () => void;
  /** Flag that the backend requires sandbox auth. */
  setNeedsAuth: (v: boolean) => void;
  /** Flag generation in progress — suppresses the token dialog. */
  setIsGenerating: (v: boolean) => void;
}

export const useSandboxAuthStore = create<SandboxAuthStore>()(
  persist(
    (set) => ({
      sandboxToken: null,
      needsAuth: false,
      isGenerating: false,

      setSandboxToken: (token: string) =>
        set({ sandboxToken: token, needsAuth: false, isGenerating: false }),

      clearSandboxToken: () =>
        set({ sandboxToken: null, needsAuth: false }),

      setNeedsAuth: (v: boolean) => set((s) => {
        // Don't show the token prompt while generating
        if (v && s.isGenerating) return {};
        return { needsAuth: v };
      }),

      setIsGenerating: (v: boolean) => set({ isGenerating: v, ...(v ? { needsAuth: false } : {}) }),
    }),
    {
      name: 'sandbox-auth-v1',
      // Only persist the token — needsAuth is transient (session-only)
      partialize: (state) => ({ sandboxToken: state.sandboxToken }),
    },
  ),
);

/**
 * Get the current sandbox token synchronously (for non-React contexts).
 */
export function getSandboxToken(): string | null {
  return useSandboxAuthStore.getState().sandboxToken;
}
