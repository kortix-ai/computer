'use client';

import { memo, useRef, useEffect, useCallback, useState } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Terminal as XTerm, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getPtyWebSocketUrl, useUpdatePty } from '@/hooks/opencode/use-opencode-pty';
import type { Pty } from '@kortix/opencode-sdk/v2/client';

// ============================================================================
// Theme
// ============================================================================

const darkTheme: ITheme = {
  background: 'rgba(15, 15, 20, 0.85)',
  foreground: '#e4e4e7',
  cursor: '#a78bfa',
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

const lightTheme: ITheme = {
  background: 'rgba(250, 250, 252, 0.9)',
  foreground: '#18181b',
  cursor: '#7c3aed',
  cursorAccent: '#fafafc',
  selectionBackground: 'rgba(124, 58, 237, 0.15)',
  black: '#18181b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#a1a1aa',
  brightBlack: '#52525b',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#fafafa',
};

// ============================================================================
// Types
// ============================================================================

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface PtyTerminalProps {
  pty: Pty;
  className?: string;
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

export const PtyTerminal = memo(function PtyTerminal({
  pty,
  className,
  onStatusChange,
}: PtyTerminalProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef<number>(0);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const updatePty = useUpdatePty();

  const updateStatus = useCallback((s: ConnectionStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

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

  // Connect WebSocket to PTY
  const connectWebSocket = useCallback((term: XTerm) => {
    if (wsRef.current) return;

    globalPtyConnectionId++;
    const myConnectionId = globalPtyConnectionId;
    connectionIdRef.current = myConnectionId;

    updateStatus('connecting');
    term.writeln('\x1b[33mConnecting to terminal...\x1b[0m');

    const wsUrl = getPtyWebSocketUrl(pty.id);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (connectionIdRef.current !== myConnectionId) {
        ws.close();
        return;
      }
      updateStatus('connected');

      // Send initial terminal size so the shell renders a prompt
      const { cols, rows } = term;
      if (cols && rows) {
        sendResize(cols, rows);
      }
    };

    ws.onmessage = (event) => {
      if (connectionIdRef.current !== myConnectionId) return;
      // PTY WebSocket sends raw terminal data
      if (typeof event.data === 'string') {
        term.write(event.data);
      } else if (event.data instanceof Blob) {
        event.data.text().then((text) => term.write(text));
      }
    };

    ws.onerror = () => {
      if (connectionIdRef.current !== myConnectionId) return;
      term.writeln('\x1b[31mConnection error\x1b[0m');
      updateStatus('error');
    };

    ws.onclose = (event) => {
      if (connectionIdRef.current !== myConnectionId) return;
      wsRef.current = null;
      if (status !== 'error') {
        term.writeln(`\x1b[33mConnection closed${event.code ? ` (${event.code})` : ''}\x1b[0m`);
      }
      updateStatus('disconnected');
    };
  }, [pty.id, updateStatus, sendResize, status]);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current) return;

    const container = terminalRef.current;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: isDark ? darkTheme : lightTheme,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(container);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Delay initial fit to ensure the container has real dimensions
    // This prevents the "Cannot read properties of undefined (reading 'dimensions')" error
    const initFitTimer = setTimeout(() => {
      safeFit(fitAddon, container);
      // Connect WebSocket only after the terminal is properly sized
      connectWebSocket(term);
    }, 50);

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
      // Use rAF to ensure layout has settled before measuring
      requestAnimationFrame(() => safeFit(fitAddonRef.current, container));
    });
    resizeObserver.observe(container);

    return () => {
      clearTimeout(initFitTimer);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [pty.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme updates
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = isDark ? darkTheme : lightTheme;
    }
  }, [isDark]);

  return (
    <div
      ref={terminalRef}
      className={cn(
        'overflow-hidden',
        'bg-gradient-to-b from-zinc-50 to-white dark:from-[#0f0f14] dark:to-[#0a0a0d]',
        className,
      )}
      style={{ padding: '8px 12px' }}
    />
  );
});

PtyTerminal.displayName = 'PtyTerminal';
