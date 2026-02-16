'use client';

/**
 * Empty-state backdrop — just the Kortix brandmark, full height.
 * The parent renders the chat input on top.
 */
export function SessionWelcome() {
  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/kortix-brandmark-bg.svg"
          alt=""
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[140vw] min-w-[700px] h-auto sm:w-[160vw] sm:min-w-[1000px] md:min-w-[1200px] lg:w-[162vw] lg:min-w-[1620px] object-contain select-none invert dark:invert-0 opacity-100"
          draggable={false}
        />
      </div>

      {/* <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p className="text-2xl sm:text-3xl font-medium text-muted-foreground tracking-tight">
          Welcome to your Kortix
        </p>
      </div> */}
    </div>
  );
}
