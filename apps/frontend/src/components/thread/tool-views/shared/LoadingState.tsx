import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { KortixLoader } from '@/components/ui/kortix-loader';

interface LoadingStateProps {
  title: string;
  subtitle?: string;
  showProgress?: boolean;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  icon?: unknown;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  iconColor?: string;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  bgColor?: string;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  filePath?: string | null;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  progressText?: string;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  autoProgress?: boolean;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  initialProgress?: number;
  /** @deprecated Kept for backward compat with inactive views — ignored */
  useKortixLoader?: boolean;
}

export function LoadingState({
  title,
  subtitle,
  showProgress = true,
}: LoadingStateProps): React.JSX.Element {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!showProgress) return;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) { clearInterval(timer); return prev; }
        return prev + Math.random() * 10 + 5;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [showProgress]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[180px] py-6 px-4">
      <div className="text-center w-full max-w-xs">
        <div className="w-10 h-10 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
          <KortixLoader customSize={18} />
        </div>
        <h3 className="text-sm font-medium mb-1 text-foreground">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mb-3 truncate">{subtitle}</p>
        )}
        {showProgress && (
          <div className="space-y-1.5">
            <Progress value={Math.min(progress, 100)} className="w-full h-0.5" />
            <p className="text-[10px] text-muted-foreground/50">Processing...</p>
          </div>
        )}
      </div>
    </div>
  );
}
