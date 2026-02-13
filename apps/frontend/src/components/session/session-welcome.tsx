'use client';

import { DynamicGreeting } from '@/components/ui/dynamic-greeting';

const examplePrompts = [
  'Help me set up authentication with NextAuth.js',
  'Create a REST API with CRUD endpoints',
  'Fix the TypeScript errors in my project',
  'Write unit tests for the utils module',
];

interface SessionWelcomeProps {
  /** Show example prompt pills (true for session empty state, false for dashboard) */
  showPrompts?: boolean;
  /** Callback when an example prompt is clicked */
  onPromptSelect?: (text: string) => void;
}

/**
 * Shared welcome/empty-state hero used by the dashboard and session empty state.
 *
 * Renders:
 * - Brandmark background image (full viewport, faded)
 * - Centered DynamicGreeting + subtitle
 * - Optional example prompt pills
 *
 * Does NOT render a chat input -- the parent controls that.
 */
export function SessionWelcome({ showPrompts = false, onPromptSelect }: SessionWelcomeProps) {
  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Brandmark Background */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <img
          src="/kortix-brandmark-bg.svg"
          alt=""
          className="absolute left-1/2 -translate-x-1/2 top-[-10%] sm:top-1/2 sm:-translate-y-1/2 w-[140vw] min-w-[700px] h-auto sm:w-[160vw] sm:min-w-[1000px] md:min-w-[1200px] lg:w-[162vw] lg:min-w-[1620px] object-contain select-none invert dark:invert-0 opacity-60"
          draggable={false}
        />
      </div>

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-28 sm:pb-0 relative z-[1] pointer-events-none">
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center pointer-events-auto">
          {/* Greeting */}
          <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 fill-mode-both">
            <DynamicGreeting className="text-2xl sm:text-3xl md:text-4xl font-medium text-foreground tracking-tight" />
          </div>

          {/* Subtitle */}
          <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground/50 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-75 fill-mode-both">
            Ask anything about your code
          </p>

          {/* Example prompts */}
          {showPrompts && onPromptSelect && (
            <div className="w-full max-w-lg mt-8 space-y-2.5 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-150 fill-mode-both">
              <p className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider">Try asking</p>
              <div className="grid gap-1.5">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => onPromptSelect(prompt)}
                    className="text-left px-4 py-2.5 rounded-2xl bg-card/40 border border-border/30 text-[13px] text-muted-foreground/70 hover:text-foreground hover:bg-card/70 hover:border-border/50 transition-all duration-200 break-words cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
