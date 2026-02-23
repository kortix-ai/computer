'use client';

import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Terminal as XTerm, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getPtyWebSocketUrl, useUpdatePty } from '@/hooks/opencode/use-opencode-pty';
import type { Pty } from '@opencode-ai/sdk/v2/client';

// ============================================================================
// Theme
// ============================================================================

const terminalTheme: ITheme = {
  background: '#0f0f14',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: '#0f0f14',
  selectionBackground: 'rgba(139, 92, 246, 0.3)',
  black: '#27272a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
};

// ============================================================================
// Types
// ============================================================================

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PtyTerminalHandle {
  focus: () => void;
  kill: () => void;
}

interface PtyTerminalProps {
  pty: Pty;
  className?: string;
  hidden?: boolean;
  /** Server URL to connect to — locks the WS to this server even after instance switch. */
  serverUrl?: string;
  onStatusChange?: (status: ConnectionStatus) => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Safely call fitAddon.fit() only when the container has real dimensions. */
function safeFit(fitAddon: FitAddon | null, container: HTMLDivElement | null) {
  if (!fitAddon || !container) return;
  const { offsetWidth, offsetHeight } = container;
  if (offsetWidth > 0 && offsetHeight > 0) {
    try {
      fitAddon.fit();
    } catch {
      // Ignore – xterm may not be fully initialised yet
    }
  }
}

// ============================================================================
// Component
// ============================================================================

let globalPtyConnectionId = 0;

export const PtyTerminal = forwardRef<PtyTerminalHandle, PtyTerminalProps>(function PtyTerminal({
  pty,
  className,
  hidden,
  serverUrl,
  onStatusChange,
}, ref) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef<number>(0);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hadErrorRef = useRef(false);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const updatePty = useUpdatePty();

  const updateStatus = useCallback((s: ConnectionStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      xtermRef.current?.focus();
    },
    kill: () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Ctrl+C to cancel any pending input
        wsRef.current.send('\x03');
        // Small delay so the shell processes Ctrl+C before receiving exit
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send('exit\n');
          }
        }, 50);
      }
    },
  }));

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    connectionIdRef.current = 0;
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  // Send resize to server via HTTP PATCH
  const sendResize = useCallback((cols: number, rows: number) => {
    if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    resizeTimeoutRef.current = setTimeout(() => {
      updatePty.mutate({ id: pty.id, size: { rows, cols } });
    }, 100);
  }, [pty.id, updatePty]);

  // Initialize xterm + connect WebSocket (all in one effect to avoid stale closures)
  useEffect(() => {
    if (!terminalRef.current) return;

    const container = terminalRef.current;
    hadErrorRef.current = false;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: terminalTheme,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(container);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send user input through WebSocket
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // Handle resize — notify the PTY server
    term.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    // Responsive resize with dimension guard
    const handleResize = () => safeFit(fitAddonRef.current, container);
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => safeFit(fitAddonRef.current, container));
    });
    resizeObserver.observe(container);

    // Delay fit + WS connect to ensure the container has real dimensions
    const initTimer = setTimeout(() => {
      safeFit(fitAddon, container);

      // --- WebSocket connect ---
      globalPtyConnectionId++;
      const myConnectionId = globalPtyConnectionId;
      connectionIdRef.current = myConnectionId;

      updateStatus('connecting');
      term.writeln('\x1b[33mConnecting to terminal...\x1b[0m');

      const wsUrl = getPtyWebSocketUrl(pty.id, serverUrl);
      console.log('[PtyTerminal] Connecting WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (connectionIdRef.current !== myConnectionId) {
          ws.close();
          return;
        }
        console.log('[PtyTerminal] WebSocket connected');
        term.reset(); // Clear the "Connecting..." message
        term.options.theme = terminalTheme; // Re-apply after reset
        updateStatus('connected');

        // Send initial terminal size so the shell renders a prompt
        const { cols, rows } = term;
        if (cols && rows) {
          sendResize(cols, rows);
        }

        // Set up color support in the shell — env vars + aliases, then clear
        // the setup noise so the user gets a clean, colorized prompt.
        const init = [
          'export TERM=xterm-256color',
          'export COLORTERM=truecolor',
          'export CLICOLOR=1',
          'export LS_COLORS="di=1;34:ln=1;36:so=1;35:pi=33:ex=1;32:bd=1;33:cd=1;33:su=37;41:sg=30;43:tw=30;42:ow=34;42"',
          'alias ls="ls --color=auto" 2>/dev/null',
          'alias grep="grep --color=auto"',
          'alias diff="diff --color=auto"',
          'clear',
        ].join(' && ');
        ws.send(init + '\n');
      };

      ws.onmessage = (event) => {
        if (connectionIdRef.current !== myConnectionId) return;
        if (typeof event.data === 'string') {
          term.write(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then((text) => term.write(text));
        }
      };

      ws.onerror = (err) => {
        if (connectionIdRef.current !== myConnectionId) return;
        console.error('[PtyTerminal] WebSocket error:', err);
        hadErrorRef.current = true;
        term.writeln('\r\n\x1b[31mFailed to connect to terminal.\x1b[0m');
        term.writeln('\x1b[90mURL: ' + wsUrl + '\x1b[0m');
        updateStatus('error');
      };

      ws.onclose = (event) => {
        if (connectionIdRef.current !== myConnectionId) return;
        console.log('[PtyTerminal] WebSocket closed:', event.code, event.reason);
        wsRef.current = null;
        if (!hadErrorRef.current) {
          term.writeln(`\r\n\x1b[33mConnection closed${event.code ? ` (${event.code})` : ''}${event.reason ? ': ' + event.reason : ''}\x1b[0m`);
        }
        updateStatus('disconnected');
      };
    }, 80);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [pty.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit and focus when becoming visible (tab switch)
  useEffect(() => {
    if (!hidden) {
      requestAnimationFrame(() => {
        safeFit(fitAddonRef.current, terminalRef.current);
        xtermRef.current?.focus();
      });
    }
  }, [hidden]);

  return (
    <div
      ref={terminalRef}
      className={cn(
        'overflow-hidden',
        'bg-[#0f0f14]',
        hidden && 'invisible pointer-events-none',
        className,
      )}
      style={{ padding: '8px 12px' }}
    />
  );
});

PtyTerminal.displayName = 'PtyTerminal';
