'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';
import { clearUserLocalStorage } from '@/lib/utils/clear-local-storage';
// Auth tracking moved to AuthEventTracker component (handles OAuth redirects)

const IS_LOCAL = process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'local';

// Stable mock user for local mode — no Supabase, no login required.
// The ID is a fixed UUID so that anything keyed on user.id behaves consistently.
const LOCAL_USER: User = {
  id: '00000000-0000-0000-0000-000000000000',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'local@localhost',
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: { provider: 'local' },
  user_metadata: { full_name: 'Local User' },
} as User;

const LOCAL_SESSION: Session = {
  access_token: 'local-mode-no-token',
  refresh_token: 'local-mode-no-token',
  expires_in: 999999,
  expires_at: Math.floor(Date.now() / 1000) + 999999,
  token_type: 'bearer',
  user: LOCAL_USER,
};

type AuthContextType = {
  supabase: SupabaseClient;
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const supabase = createClient();

  // ── Local mode: skip Supabase entirely, provide mock user ────────────
  if (IS_LOCAL) {
    const value: AuthContextType = {
      supabase,
      session: LOCAL_SESSION,
      user: LOCAL_USER,
      isLoading: false,
      signOut: async () => {},
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  // ── Cloud mode (staging / production): real Supabase auth ────────────
  return <CloudAuthProvider supabase={supabase}>{children}</CloudAuthProvider>;
};

/**
 * Real auth provider — only rendered in staging/production.
 * Extracted to its own component so the hooks (useState, useEffect) are
 * never called conditionally; the local-mode path returns early above.
 */
function CloudAuthProvider({
  supabase,
  children,
}: {
  supabase: SupabaseClient;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getInitialSession = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (isLoading) setIsLoading(false);
        switch (event) {
          case 'SIGNED_IN':
            // Auth tracking handled by AuthEventTracker component via URL params
            break;
          case 'SIGNED_OUT':
            clearUserLocalStorage();
            break;
          case 'TOKEN_REFRESHED':
            break;
          case 'MFA_CHALLENGE_VERIFIED':
            break;
          default:
        }
      },
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      clearUserLocalStorage();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value: AuthContextType = {
    supabase,
    session,
    user,
    isLoading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
