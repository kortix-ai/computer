"use client";

import { redirect, usePathname } from 'next/navigation';
import { useGetAAL } from '@/hooks/auth';
import { useAuth } from '@/components/AuthProvider';
import { isSelfHosted } from '@/lib/config';

interface BackgroundAALCheckerProps {
  children: React.ReactNode;
  redirectTo?: string;
  enabled?: boolean;
}

/**
 * BackgroundAALChecker runs MFA checks silently in the background without blocking the UI.
 * 
 * Only redirects when:
 * - New users (created after cutoff) who don't have MFA enrolled
 * - Users who have MFA enrolled but need verification
 * - Users who need to reauthenticate due to MFA changes
 * 
 * Does NOT show loading states or block the UI - runs entirely in background.
 */
export function BackgroundAALChecker({ 
  children, 
  redirectTo = '/auth/phone-verification',
  enabled = true 
}: BackgroundAALCheckerProps) {
  const { user, isLoading: authLoading } = useAuth();
  const pathname = usePathname();
  
  // Only run queries if user is authenticated and check is enabled
  const { data: aalData } = useGetAAL();

  if (!isSelfHosted() && !authLoading && user && enabled && aalData) {
    const { action_required, current_level, next_level, verification_required } = aalData;

    const isProtectedRoute = pathname.startsWith('/dashboard') || 
                            pathname.startsWith('/agents') || 
                            pathname.startsWith('/workspace') ||
                            pathname.startsWith('/projects') ||
                            pathname.startsWith('/settings');
    
    if (isProtectedRoute) {
      if (verification_required && current_level === "aal1" && next_level === "aal1") {
        redirect(redirectTo);
      }

      switch (action_required) {
        case 'verify_mfa':
          if (verification_required) {
            redirect(redirectTo);
          }
          break;
        
        case 'reauthenticate':
          redirect('/auth?message=Please sign in again due to security changes');
          break;
        
        case 'none':
          break;
        
        case 'unknown':
        default:
          console.warn('Background: Unknown AAL state:', { current_level, next_level, action_required });
          break;
      }
    }
  }

  // Always render children immediately - no loading states
  return <>{children}</>;
} 
