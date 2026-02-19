'use client';

import { useState, useCallback } from 'react';
import { KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';

/**
 * SaveKeyDialog — shown once after sandbox creation to display the auto-generated access key.
 *
 * The user MUST copy/save this key — it's the only time it's shown.
 * After dismissal the key is already stored in sandbox-auth-store and server-store,
 * so auth works automatically. But if they clear browser data, they'll need it again.
 */
export function SaveKeyDialog({
  accessKey,
  onDismiss,
}: {
  accessKey: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accessKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = accessKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [accessKey]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 p-8 rounded-2xl border border-border bg-card shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-emerald-500" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-center mb-2">
          Save Your Access Key
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Your sandbox has been created with a unique access key.
          Copy it now — you won&apos;t see it again.
        </p>

        {/* Key display + copy */}
        <div className="relative mb-4">
          <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 font-mono text-sm break-all">
            <code className="flex-1 select-all">{accessKey}</code>
            <button
              type="button"
              onClick={handleCopy}
              className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This key is stored in your browser automatically. If you clear browser data
            or use a different browser, you&apos;ll need this key to reconnect.
            You can regenerate it from the Instance Manager if lost.
          </p>
        </div>

        {/* Confirm checkbox + Continue */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm text-muted-foreground">
            I&apos;ve saved my access key
          </span>
        </label>

        <button
          onClick={onDismiss}
          disabled={!confirmed}
          className={`
            w-full py-3 rounded-lg text-sm font-medium transition-colors
            ${confirmed
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
              : 'bg-muted text-muted-foreground cursor-not-allowed'}
          `}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
