'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSandboxAuthStore } from '@/stores/sandbox-auth-store';
import { resetClient } from '@/lib/opencode-sdk';
import { useServerStore } from '@/stores/server-store';
import { Lock, Eye, EyeOff } from 'lucide-react';

/**
 * Sandbox Token Dialog — shown when the backend requires SANDBOX_AUTH_TOKEN
 * and the frontend receives a 401 with authType='sandbox_token'.
 *
 * Simple full-screen overlay with a single password input.
 * On submit: stores the token, resets the SDK client, and bumps serverVersion
 * to trigger a full reconnect (health check, SSE, etc.).
 */
export function SandboxTokenDialog() {
  const needsAuth = useSandboxAuthStore((s) => s.needsAuth);
  const existingToken = useSandboxAuthStore((s) => s.sandboxToken);
  const setSandboxToken = useSandboxAuthStore((s) => s.setSandboxToken);

  const [value, setValue] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState(false);

  // Reset input state when dialog opens
  useEffect(() => {
    if (needsAuth) {
      setValue('');
      setError(false);
      setShowToken(false);
    }
  }, [needsAuth]);

  const handleSubmit = useCallback(async () => {
    const token = value.trim();
    if (!token) return;

    // Store the token
    setSandboxToken(token);

    // Force SDK client to recreate with the new token
    resetClient();

    // Bump server version to trigger reconnect (health check + SSE)
    const store = useServerStore.getState();
    const activeId = store.activeServerId;
    // This triggers serverVersion bump → useSandboxConnection re-checks
    store.setActiveServer(activeId, { auto: true });
  }, [value, setSandboxToken]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!needsAuth) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 p-8 rounded-2xl border border-border bg-card shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-center mb-2">
          Sandbox Authentication
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {existingToken
            ? 'The stored token was rejected. Please enter a valid access token.'
            : 'This sandbox is protected. Enter the access token to connect.'}
        </p>

        {/* Input */}
        <div className="relative mb-4">
          <input
            type={showToken ? 'text' : 'password'}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Paste your sandbox token"
            autoFocus
            className={`
              w-full px-4 py-3 pr-12 rounded-lg border text-sm
              bg-background
              placeholder:text-muted-foreground/50
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
              ${error ? 'border-destructive' : 'border-border'}
            `}
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {error && (
          <p className="text-sm text-destructive mb-4">
            Invalid token. Please check and try again.
          </p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className={`
            w-full py-3 rounded-lg text-sm font-medium transition-colors
            ${value.trim()
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
              : 'bg-muted text-muted-foreground cursor-not-allowed'}
          `}
        >
          Connect
        </button>

        {/* Help text */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          The token is the <code className="text-xs bg-muted px-1 py-0.5 rounded">SANDBOX_AUTH_TOKEN</code> value
          from your server&apos;s <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> file.
        </p>
      </div>
    </div>
  );
}
