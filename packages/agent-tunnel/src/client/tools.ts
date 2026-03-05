import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import type { TunnelClient, AXElement } from './tunnel-client';

export interface TunnelToolParameter {
  type: string;
  description: string;
  required?: boolean;
  items?: { type: string };
  enum?: string[];
}

export interface TunnelToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, TunnelToolParameter>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

function saveImage(base64: string, format: string): string {
  const ext = format === 'jpeg' || format === 'jpg' ? 'jpg' : 'png';
  const dir = join(tmpdir(), 'tunnel-screenshots');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `screenshot-${randomBytes(4).toString('hex')}.${ext}`);
  writeFileSync(path, Buffer.from(base64, 'base64'));
  return path;
}

function formatAXTree(el: AXElement, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  const parts: string[] = [];

  const label = el.title || el.value || el.description || '(unnamed)';
  const flags: string[] = [];
  if (!el.enabled) flags.push('disabled');
  if (el.focused) flags.push('focused');
  if (el.actions.length > 0) flags.push(`actions: ${el.actions.join(',')}`);
  const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';

  parts.push(`${pad}[${el.role}] ${label} (id: ${el.id})${flagStr}`);

  for (const child of el.children) {
    parts.push(formatAXTree(child, indent + 1));
  }

  return parts.join('\n');
}

const tunnelIdParam: TunnelToolParameter = {
  type: 'string',
  description: 'Tunnel connection ID (auto-discovered if omitted)',
  required: false,
};

export function createTunnelTools(client: TunnelClient): TunnelToolDefinition[] {
  return [
    {
      name: 'tunnel_status',
      description: `Check the status of all Agent Tunnel connections to the user's local machine. Lists every registered tunnel with its live/offline status, capabilities, and machine info.`,
      parameters: {},
      async execute() {
        const connections = (await client.getConnections()) as Array<Record<string, unknown>>;

        if (connections.length === 0) {
          return 'No tunnel connections found. The user needs to set up Agent Tunnel first:\n1. Create a tunnel connection\n2. Run `npx @kortix/agent-tunnel connect` on their local machine';
        }

        const sections: string[] = [];
        let hasOnline = false;

        for (const data of connections) {
          const status = data.isLive ? 'ONLINE' : 'OFFLINE';
          if (data.isLive) hasOnline = true;
          const capabilities = (data.capabilities as string[]) || [];
          const machineInfo = (data.machineInfo as Record<string, unknown>) || {};

          const lines = [
            `=== Tunnel: ${data.name || 'Unnamed'} — ${status} ===`,
            `ID: ${data.tunnelId}`,
            `Capabilities: ${capabilities.length > 0 ? capabilities.join(', ') : '(none registered)'}`,
          ];

          if (Object.keys(machineInfo).length > 0) {
            lines.push(`Machine: ${machineInfo.hostname || 'unknown'} (${machineInfo.platform || '?'} ${machineInfo.arch || '?'})`);
          }

          sections.push(lines.join('\n'));
        }

        if (!hasOnline) {
          sections.push('\nNo tunnel is currently online. Ask the user to run `npx @kortix/agent-tunnel connect` on their local machine.');
        }

        return sections.join('\n\n');
      },
    },
    {
      name: 'tunnel_fs_read',
      description: `Read a file from the user's local machine via Agent Tunnel. Requires filesystem permission.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        path: { type: 'string', description: 'Absolute path to the file on the user\'s local machine', required: true },
        encoding: { type: 'string', description: 'File encoding (default: utf-8)', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('fs.read', {
          path: args.path,
          encoding: (args.encoding as string) || 'utf-8',
        });
        if (typeof result === 'string') return result;
        const data = result as Record<string, unknown>;
        return `=== File: ${args.path} (${data.size} bytes) ===\n${data.content}`;
      },
    },
    {
      name: 'tunnel_fs_write',
      description: `Write a file to the user's local machine via Agent Tunnel. Creates parent directories if needed. Requires filesystem write permission.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        path: { type: 'string', description: 'Absolute path for the file on the user\'s local machine', required: true },
        content: { type: 'string', description: 'File content to write', required: true },
        encoding: { type: 'string', description: 'File encoding (default: utf-8)', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('fs.write', {
          path: args.path,
          content: args.content,
          encoding: (args.encoding as string) || 'utf-8',
        });
        if (typeof result === 'string') return result;
        const data = result as Record<string, unknown>;
        return `File written: ${data.path} (${data.size} bytes)`;
      },
    },
    {
      name: 'tunnel_fs_list',
      description: `List directory contents on the user's local machine via Agent Tunnel. Requires filesystem permission.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        path: { type: 'string', description: 'Absolute path to the directory on the user\'s local machine', required: true },
        recursive: { type: 'boolean', description: 'Include subdirectory contents (default: false)', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('fs.list', {
          path: args.path,
          recursive: args.recursive || false,
        });
        if (typeof result === 'string') return result;

        const data = result as { entries: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>; count: number };
        if (data.entries.length === 0) return `Directory is empty: ${args.path}`;

        const lines = [`=== Directory: ${args.path} (${data.count} entries) ===`];
        for (const entry of data.entries) {
          const type = entry.isDirectory ? '[DIR]' : '[FILE]';
          lines.push(`  ${type} ${entry.name}`);
        }
        return lines.join('\n');
      },
    },
    {
      name: 'tunnel_shell_exec',
      description: `Execute a command on the user's local machine via Agent Tunnel. Commands are executed without shell interpolation (array args) for security. Requires shell permission.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        command: { type: 'string', description: "Command executable name (e.g., 'ls', 'git', 'python')", required: true },
        args: { type: 'array', description: 'Command arguments as separate strings (no shell interpolation)', required: false, items: { type: 'string' } },
        cwd: { type: 'string', description: 'Working directory for the command', required: false },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000, max: 120000)', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('shell.exec', {
          command: args.command,
          args: (args.args as string[]) || [],
          cwd: args.cwd,
          timeout: args.timeout,
        });
        if (typeof result === 'string') return result;

        const data = result as {
          exitCode: number | null;
          signal: string | null;
          stdout: string;
          stderr: string;
          stdoutTruncated: boolean;
          stderrTruncated: boolean;
        };

        const lines = [`=== Command: ${args.command} ${((args.args as string[]) || []).join(' ')} ===`];
        lines.push(`Exit code: ${data.exitCode ?? 'N/A'}${data.signal ? ` (signal: ${data.signal})` : ''}`);
        if (data.stdout) {
          lines.push(`\n--- stdout${data.stdoutTruncated ? ' (truncated)' : ''} ---`);
          lines.push(data.stdout);
        }
        if (data.stderr) {
          lines.push(`\n--- stderr${data.stderrTruncated ? ' (truncated)' : ''} ---`);
          lines.push(data.stderr);
        }
        return lines.join('\n');
      },
    },
    {
      name: 'tunnel_screenshot',
      description: `Take a screenshot of the user's screen via Agent Tunnel. Saves the image to a temp file and returns the path.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        x: { type: 'number', description: 'Region X coordinate', required: false },
        y: { type: 'number', description: 'Region Y coordinate', required: false },
        width: { type: 'number', description: 'Region width', required: false },
        height: { type: 'number', description: 'Region height', required: false },
        windowId: { type: 'number', description: 'Capture a specific window by ID', required: false },
      },
      async execute(args) {
        const params: Record<string, unknown> = {};
        if (args.x !== undefined && args.y !== undefined && args.width !== undefined && args.height !== undefined) {
          params.region = { x: args.x, y: args.y, width: args.width, height: args.height };
        }
        if (args.windowId !== undefined) params.windowId = args.windowId;

        const result = await client.rpcWithPermissionFlow('desktop.screenshot', params);
        if (typeof result === 'string') return result;

        const data = result as { image: string; width: number; height: number; format?: string };
        const format = data.format || 'png';
        const sizeKB = Math.round(data.image.length * 0.75 / 1024);
        const path = saveImage(data.image, format);
        return `Screenshot saved: ${path}\nDimensions: ${data.width}x${data.height} ${format.toUpperCase()} (${sizeKB}KB)\n\nUse the Read tool to view this image.`;
      },
    },
    {
      name: 'tunnel_click',
      description: `Click at a specific screen coordinate on the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        x: { type: 'number', description: 'X coordinate to click', required: true },
        y: { type: 'number', description: 'Y coordinate to click', required: true },
        button: { type: 'string', description: 'Mouse button (default: left)', required: false, enum: ['left', 'right', 'middle'] },
        clicks: { type: 'number', description: 'Number of clicks (default: 1, use 2 for double-click)', required: false },
        modifiers: { type: 'array', description: 'Modifier keys held during click: cmd, shift, alt, ctrl', required: false, items: { type: 'string' } },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.mouse.click', {
          x: args.x, y: args.y, button: args.button, clicks: args.clicks, modifiers: args.modifiers,
        });
        if (typeof result === 'string') return result;
        return `Clicked at (${args.x}, ${args.y}) [${args.button || 'left'}]${args.clicks && (args.clicks as number) > 1 ? ` x${args.clicks}` : ''}`;
      },
    },
    {
      name: 'tunnel_mouse_move',
      description: `Move the mouse cursor to a specific position on the user's screen via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        x: { type: 'number', description: 'Target X coordinate', required: true },
        y: { type: 'number', description: 'Target Y coordinate', required: true },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.mouse.move', { x: args.x, y: args.y });
        if (typeof result === 'string') return result;
        return `Mouse moved to (${args.x}, ${args.y})`;
      },
    },
    {
      name: 'tunnel_mouse_drag',
      description: `Drag from one point to another on the user's screen via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        fromX: { type: 'number', description: 'Start X coordinate', required: true },
        fromY: { type: 'number', description: 'Start Y coordinate', required: true },
        toX: { type: 'number', description: 'End X coordinate', required: true },
        toY: { type: 'number', description: 'End Y coordinate', required: true },
        button: { type: 'string', description: 'Mouse button (default: left)', required: false, enum: ['left', 'right'] },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.mouse.drag', {
          fromX: args.fromX, fromY: args.fromY, toX: args.toX, toY: args.toY, button: args.button,
        });
        if (typeof result === 'string') return result;
        return `Dragged from (${args.fromX}, ${args.fromY}) to (${args.toX}, ${args.toY})`;
      },
    },
    {
      name: 'tunnel_mouse_scroll',
      description: `Scroll the mouse wheel at a specific position on the user's screen via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        x: { type: 'number', description: 'X coordinate to scroll at', required: true },
        y: { type: 'number', description: 'Y coordinate to scroll at', required: true },
        deltaX: { type: 'number', description: 'Horizontal scroll amount (positive=right)', required: false },
        deltaY: { type: 'number', description: 'Vertical scroll amount (positive=down)', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.mouse.scroll', {
          x: args.x, y: args.y, deltaX: args.deltaX, deltaY: args.deltaY,
        });
        if (typeof result === 'string') return result;
        return `Scrolled at (${args.x}, ${args.y}) [dx=${args.deltaX || 0}, dy=${args.deltaY || 0}]`;
      },
    },

    {
      name: 'tunnel_type',
      description: `Type text into the currently focused application on the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        text: { type: 'string', description: 'Text to type', required: true },
        delay: { type: 'number', description: 'Delay between characters in ms', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.keyboard.type', {
          text: args.text, delay: args.delay,
        });
        if (typeof result === 'string') return result;
        return `Typed ${(args.text as string).length} characters`;
      },
    },
    {
      name: 'tunnel_key',
      description: `Press a key combination on the user's machine via Agent Tunnel. Use for keyboard shortcuts like cmd+s, ctrl+c, enter, tab, etc.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        keys: { type: 'array', description: "Keys to press simultaneously. Examples: ['cmd', 's'] for save, ['enter'] for enter", required: true, items: { type: 'string' } },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.keyboard.key', { keys: args.keys });
        if (typeof result === 'string') return result;
        return `Pressed: ${(args.keys as string[]).join('+')}`;
      },
    },

    {
      name: 'tunnel_window_list',
      description: `List all visible windows on the user's machine via Agent Tunnel. Returns window IDs, app names, titles, positions, and sizes.`,
      parameters: {
        tunnel_id: tunnelIdParam,
      },
      async execute() {
        const result = await client.rpcWithPermissionFlow('desktop.window.list', {});
        if (typeof result === 'string') return result;

        const data = result as { windows: Array<{ id: number; app: string; title: string; bounds: { x: number; y: number; width: number; height: number }; minimized: boolean }> };
        if (data.windows.length === 0) return 'No windows found';

        const lines = [`=== Windows (${data.windows.length}) ===`];
        for (const w of data.windows) {
          const min = w.minimized ? ' [minimized]' : '';
          lines.push(`  #${w.id} | ${w.app} — "${w.title}" | ${w.bounds.x},${w.bounds.y} ${w.bounds.width}x${w.bounds.height}${min}`);
        }
        return lines.join('\n');
      },
    },
    {
      name: 'tunnel_window_focus',
      description: `Bring a window to the front on the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        windowId: { type: 'number', description: 'Window ID from tunnel_window_list', required: true },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.window.focus', { windowId: args.windowId });
        if (typeof result === 'string') return result;
        return `Window #${args.windowId} focused`;
      },
    },

    {
      name: 'tunnel_app_launch',
      description: `Launch an application on the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        app: { type: 'string', description: 'Application name to launch', required: true },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.app.launch', { app: args.app });
        if (typeof result === 'string') return result;
        return `Launched: ${args.app}`;
      },
    },
    {
      name: 'tunnel_app_quit',
      description: `Quit an application on the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        app: { type: 'string', description: 'Application name to quit', required: true },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.app.quit', { app: args.app });
        if (typeof result === 'string') return result;
        return `Quit: ${args.app}`;
      },
    },

    {
      name: 'tunnel_clipboard_read',
      description: `Read the clipboard contents from the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
      },
      async execute() {
        const result = await client.rpcWithPermissionFlow('desktop.clipboard.read', {});
        if (typeof result === 'string') return result;
        const data = result as { text: string };
        if (!data.text) return '(clipboard is empty)';
        return `=== Clipboard ===\n${data.text}`;
      },
    },
    {
      name: 'tunnel_clipboard_write',
      description: `Write text to the clipboard on the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        text: { type: 'string', description: 'Text to write to clipboard', required: true },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.clipboard.write', { text: args.text });
        if (typeof result === 'string') return result;
        return `Clipboard updated (${(args.text as string).length} chars)`;
      },
    },

    {
      name: 'tunnel_screen_info',
      description: `Get screen resolution and scale factor from the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
      },
      async execute() {
        const result = await client.rpcWithPermissionFlow('desktop.screen.info', {});
        if (typeof result === 'string') return result;
        const data = result as { width: number; height: number; scaleFactor: number };
        return `Screen: ${data.width}x${data.height} @ ${data.scaleFactor}x scale`;
      },
    },

    {
      name: 'tunnel_cursor_image',
      description: `Take a small screenshot around the current cursor position on the user's machine via Agent Tunnel.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        radius: { type: 'number', description: 'Radius in pixels around cursor (default: 50)', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.cursor.image', { radius: args.radius });
        if (typeof result === 'string') return result;

        const data = result as { image: string; width: number; height: number; format?: string };
        const format = data.format || 'png';
        const sizeKB = Math.round(data.image.length * 0.75 / 1024);
        const path = saveImage(data.image, format);
        return `Cursor area saved: ${path}\nDimensions: ${data.width}x${data.height} ${format.toUpperCase()} (${sizeKB}KB)\n\nUse the Read tool to view this image.`;
      },
    },

    {
      name: 'tunnel_ax_tree',
      description: `Get the accessibility tree of an application on the user's machine via Agent Tunnel. Returns a structured tree of UI elements with roles, labels, states, and available actions.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        pid: { type: 'number', description: 'Process ID of the target application (omit for all apps)', required: false },
        maxDepth: { type: 'number', description: 'Maximum tree depth (default: 8)', required: false },
        roles: { type: 'array', description: "Filter by element roles (e.g., ['button', 'textfield'])", required: false, items: { type: 'string' } },
      },
      async execute(args) {
        const params: Record<string, unknown> = {};
        if (args.pid !== undefined) params.pid = args.pid;
        if (args.maxDepth !== undefined) params.maxDepth = args.maxDepth;
        if (args.roles !== undefined) params.roles = args.roles;

        const result = await client.rpcWithPermissionFlow('desktop.ax.tree', params);
        if (typeof result === 'string') return result;

        const data = result as { root: AXElement; elementCount: number };
        if (!data.root) return 'No accessibility tree available';

        const tree = formatAXTree(data.root);
        return `=== Accessibility Tree (${data.elementCount} elements) ===\n${tree}`;
      },
    },
    {
      name: 'tunnel_ax_action',
      description: `Perform an accessibility action on a UI element via Agent Tunnel. Returns before/after state to verify the action worked. Common actions: AXPress, AXConfirm, AXCancel, AXRaise, AXShowMenu.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        elementId: { type: 'string', description: "Element ID from the accessibility tree (e.g., '0.3.1')", required: true },
        action: { type: 'string', description: 'Action to perform: AXPress, AXConfirm, AXCancel, AXRaise, AXShowMenu', required: true },
        pid: { type: 'number', description: 'Process ID of the target application', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.ax.action', {
          elementId: args.elementId, action: args.action, pid: args.pid,
        });
        if (typeof result === 'string') return result;

        const data = result as {
          ok: boolean; action: string; elementId: string;
          before: { focused: boolean; value: string };
          after: { focused: boolean; value: string };
          stateChanged: boolean; role: string; title: string;
        };

        const lines = [`Action "${data.action}" on [${data.role}] "${data.title}" (${data.elementId})`];
        lines.push(`State changed: ${data.stateChanged ? 'YES' : 'NO'}`);
        lines.push(`Before: focused=${data.before.focused}, value="${data.before.value}"`);
        lines.push(`After:  focused=${data.after.focused}, value="${data.after.value}"`);
        if (!data.stateChanged) {
          lines.push('WARNING: No state change detected. The action may not have had any effect.');
        }
        return lines.join('\n');
      },
    },
    {
      name: 'tunnel_ax_set_value',
      description: `Directly set the value of a UI element (text field, search box, etc.) via the accessibility API. Much more reliable than clicking and typing.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        elementId: { type: 'string', description: "Element ID from the accessibility tree (e.g., '0.3.1')", required: true },
        value: { type: 'string', description: 'The value to set (e.g., text to put in a search field)', required: true },
        pid: { type: 'number', description: 'Process ID of the target application', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.ax.set_value', {
          elementId: args.elementId, value: args.value, pid: args.pid,
        });
        if (typeof result === 'string') return result;

        const data = result as {
          ok: boolean; elementId: string;
          requestedValue: string; actualValue: string; error?: string;
        };

        if (data.ok) {
          return `Value set successfully on ${data.elementId}\nRequested: "${data.requestedValue}"\nVerified:  "${data.actualValue}"`;
        } else {
          return `FAILED to set value on ${data.elementId}\nRequested: "${data.requestedValue}"\nActual:    "${data.actualValue}"\nError: ${data.error || 'unknown'}`;
        }
      },
    },
    {
      name: 'tunnel_ax_focus',
      description: `Focus a UI element directly via the accessibility API. More reliable than clicking to focus.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        elementId: { type: 'string', description: "Element ID from the accessibility tree (e.g., '0.3.1')", required: true },
        pid: { type: 'number', description: 'Process ID of the target application', required: false },
      },
      async execute(args) {
        const result = await client.rpcWithPermissionFlow('desktop.ax.focus', {
          elementId: args.elementId, pid: args.pid,
        });
        if (typeof result === 'string') return result;

        const data = result as {
          ok: boolean; elementId: string; role: string; title: string;
          before: { focused: boolean }; after: { focused: boolean }; error?: string;
        };

        if (data.ok) {
          return `Focused [${data.role}] "${data.title}" (${data.elementId})\nBefore: focused=${data.before.focused}\nAfter:  focused=${data.after.focused}`;
        } else {
          return `FAILED to focus [${data.role}] "${data.title}" (${data.elementId})\nError: ${data.error || 'unknown'}\nBefore: focused=${data.before.focused}\nAfter:  focused=${data.after.focused}`;
        }
      },
    },
    {
      name: 'tunnel_ax_search',
      description: `Search the accessibility tree for UI elements matching a query via Agent Tunnel. Case-insensitive substring match on titles, values, and descriptions.`,
      parameters: {
        tunnel_id: tunnelIdParam,
        query: { type: 'string', description: 'Search text (matches against title, value, description)', required: true },
        role: { type: 'string', description: "Filter by element role (e.g., 'button', 'textfield')", required: false },
        pid: { type: 'number', description: 'Process ID of the target application', required: false },
        maxResults: { type: 'number', description: 'Maximum results to return (default: 20)', required: false },
      },
      async execute(args) {
        const params: Record<string, unknown> = { query: args.query };
        if (args.role !== undefined) params.role = args.role;
        if (args.pid !== undefined) params.pid = args.pid;
        if (args.maxResults !== undefined) params.maxResults = args.maxResults;

        const result = await client.rpcWithPermissionFlow('desktop.ax.search', params);
        if (typeof result === 'string') return result;

        const data = result as { elements: AXElement[] };
        if (!data.elements || data.elements.length === 0) return `No elements found matching "${args.query}"`;

        const lines = [`=== AX Search: "${args.query}" (${data.elements.length} results) ===`];
        for (const el of data.elements) {
          const label = el.title || el.value || el.description || '(unnamed)';
          const flags: string[] = [];
          if (!el.enabled) flags.push('disabled');
          if (el.focused) flags.push('focused');
          if (el.actions.length > 0) flags.push(`actions: ${el.actions.join(',')}`);
          const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
          const b = el.bounds;
          lines.push(`  [${el.role}] ${label} (id: ${el.id}) @ ${b.x},${b.y} ${b.width}x${b.height}${flagStr}`);
        }
        return lines.join('\n');
      },
    },
  ];
}
