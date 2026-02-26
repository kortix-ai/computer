import { platform } from 'os';
import type { Capability, RpcHandler } from './index';
import type { DesktopDriver } from './desktop/types';

function createDriver(): DesktopDriver {
  switch (platform()) {
    case 'darwin': {
      const { MacOSDriver } = require('./desktop/macos-driver');
      return new MacOSDriver();
    }
    case 'win32': {
      const { WindowsDriver } = require('./desktop/windows-driver');
      return new WindowsDriver();
    }
    default: {
      const { LinuxDriver } = require('./desktop/linux-driver');
      return new LinuxDriver();
    }
  }
}

export function createDesktopCapability(): Capability {
  const driver = createDriver();
  const methods = new Map<string, RpcHandler>();

  methods.set('desktop.screenshot', async (params) => {
    return driver.screenshot({
      region: params.region as any,
      windowId: params.windowId as number | undefined,
    });
  });

  methods.set('desktop.mouse.click', async (params) => {
    await driver.mouseClick({
      x: params.x as number,
      y: params.y as number,
      button: params.button as any,
      clicks: params.clicks as number | undefined,
      modifiers: params.modifiers as string[] | undefined,
    });
    return { ok: true };
  });

  methods.set('desktop.mouse.move', async (params) => {
    await driver.mouseMove({
      x: params.x as number,
      y: params.y as number,
    });
    return { ok: true };
  });

  methods.set('desktop.mouse.drag', async (params) => {
    await driver.mouseDrag({
      fromX: params.fromX as number,
      fromY: params.fromY as number,
      toX: params.toX as number,
      toY: params.toY as number,
      button: params.button as any,
    });
    return { ok: true };
  });

  methods.set('desktop.mouse.scroll', async (params) => {
    await driver.mouseScroll({
      x: params.x as number,
      y: params.y as number,
      deltaX: params.deltaX as number | undefined,
      deltaY: params.deltaY as number | undefined,
    });
    return { ok: true };
  });

  methods.set('desktop.mouse.position', async () => {
    return driver.mousePosition();
  });

  methods.set('desktop.keyboard.type', async (params) => {
    await driver.keyboardType({
      text: params.text as string,
      delay: params.delay as number | undefined,
    });
    return { ok: true };
  });

  methods.set('desktop.keyboard.key', async (params) => {
    await driver.keyboardKey({
      keys: params.keys as string[],
    });
    return { ok: true };
  });

  methods.set('desktop.window.list', async () => {
    return { windows: await driver.windowList() };
  });

  methods.set('desktop.window.focus', async (params) => {
    await driver.windowFocus(params.windowId as number);
    return { ok: true };
  });

  methods.set('desktop.window.resize', async (params) => {
    await driver.windowResize(params.windowId as number, {
      x: params.x as number | undefined,
      y: params.y as number | undefined,
      width: params.width as number | undefined,
      height: params.height as number | undefined,
    });
    return { ok: true };
  });

  methods.set('desktop.window.close', async (params) => {
    await driver.windowClose(params.windowId as number);
    return { ok: true };
  });

  methods.set('desktop.window.minimize', async (params) => {
    await driver.windowMinimize(params.windowId as number);
    return { ok: true };
  });

  methods.set('desktop.app.launch', async (params) => {
    await driver.appLaunch(params.app as string);
    return { ok: true };
  });

  methods.set('desktop.app.quit', async (params) => {
    await driver.appQuit(params.app as string);
    return { ok: true };
  });

  methods.set('desktop.app.list', async () => {
    return { apps: await driver.appList() };
  });

  methods.set('desktop.clipboard.read', async () => {
    return { text: await driver.clipboardRead() };
  });

  methods.set('desktop.clipboard.write', async (params) => {
    await driver.clipboardWrite(params.text as string);
    return { ok: true };
  });

  methods.set('desktop.screen.info', async () => {
    return driver.screenInfo();
  });

  methods.set('desktop.cursor.image', async (params) => {
    return driver.cursorImage(params.radius as number | undefined);
  });

  methods.set('desktop.ax.tree', async (params) => {
    return driver.axTree({
      pid: params.pid as number | undefined,
      maxDepth: params.maxDepth as number | undefined,
      roles: params.roles as string[] | undefined,
    });
  });

  methods.set('desktop.ax.action', async (params) => {
    return driver.axAction({
      elementId: params.elementId as string,
      action: params.action as string,
      pid: params.pid as number | undefined,
    });
  });

  methods.set('desktop.ax.set_value', async (params) => {
    return driver.axSetValue({
      elementId: params.elementId as string,
      value: params.value as string,
      pid: params.pid as number | undefined,
    });
  });

  methods.set('desktop.ax.focus', async (params) => {
    return driver.axFocus({
      elementId: params.elementId as string,
      pid: params.pid as number | undefined,
    });
  });

  methods.set('desktop.ax.search', async (params) => {
    return driver.axSearch({
      query: params.query as string,
      role: params.role as string | undefined,
      pid: params.pid as number | undefined,
      maxResults: params.maxResults as number | undefined,
    });
  });

  return {
    name: 'desktop',
    methods,
  };
}
