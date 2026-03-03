import { execHelper } from './csharp-helper';
import type {
  DesktopDriver,
  ScreenshotOptions,
  ScreenshotResult,
  MouseClickOptions,
  MouseMoveOptions,
  MouseDragOptions,
  MouseScrollOptions,
  MousePosition,
  KeyboardTypeOptions,
  KeyboardKeyOptions,
  WindowInfo,
  WindowBounds,
  AppInfo,
  ScreenInfo,
  AXTreeOptions,
  AXTreeResult,
  AXActionOptions,
  AXActionResult,
  AXSetValueOptions,
  AXSetValueResult,
  AXFocusOptions,
  AXFocusResult,
  AXSearchOptions,
  AXSearchResult,
} from './types';

export class WindowsDriver implements DesktopDriver {
  async screenshot(_options: ScreenshotOptions): Promise<ScreenshotResult> {
    const res = await execHelper({ action: 'screenshot' });
    return {
      image: res.image!,
      width: res.width!,
      height: res.height!,
      format: (res.format as 'png' | 'jpeg') || 'jpeg',
    };
  }

  async mouseClick(options: MouseClickOptions): Promise<void> {
    await execHelper({
      action: 'click',
      x: options.x,
      y: options.y,
      button: options.button || 'left',
      clicks: options.clicks || 1,
    });
  }

  async mouseMove(options: MouseMoveOptions): Promise<void> {
    await execHelper({ action: 'move', x: options.x, y: options.y });
  }

  async mouseDrag(options: MouseDragOptions): Promise<void> {
    await execHelper({
      action: 'drag',
      x: options.fromX,
      y: options.fromY,
      toX: options.toX,
      toY: options.toY,
      button: options.button || 'left',
    });
  }

  async mouseScroll(options: MouseScrollOptions): Promise<void> {
    await execHelper({
      action: 'scroll',
      x: options.x,
      y: options.y,
      deltaX: options.deltaX || 0,
      deltaY: options.deltaY || 0,
    });
  }

  async mousePosition(): Promise<MousePosition> {
    const res = await execHelper({ action: 'position' });
    return { x: res.x!, y: res.y! };
  }

  async keyboardType(options: KeyboardTypeOptions): Promise<void> {
    await execHelper({ action: 'type', text: options.text });
    if (options.delay) {
      await new Promise(r => setTimeout(r, options.delay));
    }
  }

  async keyboardKey(options: KeyboardKeyOptions): Promise<void> {
    await execHelper({ action: 'key', keys: options.keys });
  }

  async windowList(): Promise<WindowInfo[]> {
    const res = await execHelper({ action: 'window_list' });
    return (res.windows || []) as WindowInfo[];
  }

  async windowFocus(windowId: number): Promise<void> {
    await execHelper({ action: 'window_focus', windowId });
  }

  async windowResize(windowId: number, bounds: Partial<WindowBounds>): Promise<void> {
    const windows = await this.windowList();
    const win = windows.find(w => w.id === windowId);
    if (!win) throw new Error(`Window ${windowId} not found`);

    await execHelper({
      action: 'window_resize',
      windowId,
      x: bounds.x ?? win.bounds.x,
      y: bounds.y ?? win.bounds.y,
      width: bounds.width ?? win.bounds.width,
      height: bounds.height ?? win.bounds.height,
    });
  }

  async windowClose(windowId: number): Promise<void> {
    await execHelper({ action: 'window_close', windowId });
  }

  async windowMinimize(windowId: number): Promise<void> {
    await execHelper({ action: 'window_minimize', windowId });
  }

  async appLaunch(name: string): Promise<void> {
    await execHelper({ action: 'app_launch', name });
  }

  async appQuit(name: string): Promise<void> {
    await execHelper({ action: 'app_quit', name });
  }

  async appList(): Promise<AppInfo[]> {
    const res = await execHelper({ action: 'app_list' });
    return (res.apps || []) as AppInfo[];
  }

  async clipboardRead(): Promise<string> {
    const res = await execHelper({ action: 'clipboard_read' });
    return res.text || '';
  }

  async clipboardWrite(text: string): Promise<void> {
    await execHelper({ action: 'clipboard_write', text });
  }

  async screenInfo(): Promise<ScreenInfo> {
    const res = await execHelper({ action: 'screen_info' });
    return {
      width: res.width!,
      height: res.height!,
      scaleFactor: res.scaleFactor!,
    };
  }

  async cursorImage(radius: number = 50): Promise<ScreenshotResult> {
    // Windows: take full screenshot and crop around cursor
    const pos = await this.mousePosition();
    // For now, return full screenshot — region capture can be added later
    return this.screenshot({
      region: {
        x: Math.max(0, Math.round(pos.x - radius)),
        y: Math.max(0, Math.round(pos.y - radius)),
        width: radius * 2,
        height: radius * 2,
      },
    });
  }

  async axTree(options: AXTreeOptions): Promise<AXTreeResult> {
    const res = await execHelper({
      action: 'ax_tree',
      pid: options.pid,
      maxDepth: options.maxDepth ?? 8,
      roles: options.roles,
    });
    return {
      root: res.root,
      elementCount: res.elementCount!,
    };
  }

  async axAction(options: AXActionOptions): Promise<AXActionResult> {
    const res = await execHelper({
      action: 'ax_action',
      elementId: options.elementId,
      action_name: options.action,
      pid: options.pid,
    });
    return res as unknown as AXActionResult;
  }

  async axSetValue(options: AXSetValueOptions): Promise<AXSetValueResult> {
    const res = await execHelper({
      action: 'ax_set_value',
      elementId: options.elementId,
      value: options.value,
      pid: options.pid,
    });
    return res as unknown as AXSetValueResult;
  }

  async axFocus(options: AXFocusOptions): Promise<AXFocusResult> {
    const res = await execHelper({
      action: 'ax_focus',
      elementId: options.elementId,
      pid: options.pid,
    });
    return res as unknown as AXFocusResult;
  }

  async axSearch(options: AXSearchOptions): Promise<AXSearchResult> {
    const res = await execHelper({
      action: 'ax_search',
      query: options.query,
      role: options.role,
      pid: options.pid,
      maxResults: options.maxResults ?? 20,
    });
    return { elements: res.elements || [] };
  }
}
