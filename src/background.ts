/// <reference path="./types/chrome.d.ts" />

function bridgePort(): number {
  return Number(
    (globalThis as { __COCOS_BRIDGE_PORT__?: number }).__COCOS_BRIDGE_PORT__ ??
      17373
  );
}

function wsUrl(): string {
  return `ws://127.0.0.1:${bridgePort()}`;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

async function publishTabs(): Promise<void> {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  socket.send(
    JSON.stringify({
      type: 'tabs',
      tabs: tabs.map((t) => ({
        id: t.id,
        url: t.url ?? '',
        title: t.title ?? '',
      })),
    })
  );
}

async function findCocosTab(
  pageUrlMatch: string
): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({
    url: ['http://*/*', 'https://*/*'],
    active: true,
    currentWindow: true,
  });

  const match = pageUrlMatch.trim().toLowerCase();
  const pool = tabs.length ? tabs : await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });

  for (const tab of pool) {
    if (!tab.id || !tab.url) continue;
    if (match && !tab.url.toLowerCase().includes(match)) continue;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => !!(window as Window & { __cocosInspectorApi?: unknown }).__cocosInspectorApi,
      });
      if (result) return tab;
    } catch {
      /* 无权限或未注入 */
    }
  }

  for (const tab of pool) {
    if (!tab.id || !tab.url) continue;
    if (match && !tab.url.toLowerCase().includes(match)) continue;
    return tab;
  }

  return null;
}

async function executeApiOnTab(
  tabId: number,
  method: string,
  args: unknown[]
): Promise<unknown> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (m: string, a: unknown[]) => {
      const api = (window as Window & {
        __cocosInspectorApi?: Record<string, (...p: unknown[]) => unknown>;
      }).__cocosInspectorApi;
      if (!api) {
        return { __error: '__cocosInspectorApi 未就绪，请确认试玩页已加载扩展' };
      }
      if (m === '__ping') return { ok: true, pageUrl: location.href };
      const fn = api[m];
      if (typeof fn !== 'function') {
        return { __error: `未知 API: ${m}` };
      }
      return await fn(...a);
    },
    args: [method, args],
  });

  const out = result as { __error?: string } | unknown;
  if (out && typeof out === 'object' && '__error' in (out as object)) {
    throw new Error((out as { __error: string }).__error);
  }
  return out;
}

async function captureVisibleTab(
  pageUrlMatch: string
): Promise<{ ok: true; base64: string; width: number; height: number }> {
  const tab = await findCocosTab(pageUrlMatch);
  if (!tab?.windowId) throw new Error('未找到试玩标签页');

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
  });
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;

  return {
    ok: true,
    base64,
    width: 0,
    height: 0,
  };
}

async function handleBridgeCall(msg: {
  id: number;
  method: string;
  args: unknown[];
  pageUrlMatch?: string;
}): Promise<void> {
  const respond = (payload: object) => {
    socket?.send(JSON.stringify({ type: 'response', id: msg.id, ...payload }));
  };

  try {
    if (msg.method === '__captureVisibleTab') {
      const result = await captureVisibleTab(msg.pageUrlMatch ?? '');
      respond({ result });
      return;
    }

    const tab = await findCocosTab(msg.pageUrlMatch ?? '');
    if (!tab?.id) {
      respond({
        error:
          '未找到已注入 Inspector 的试玩页。请打开游戏页并保持标签页存在。',
      });
      return;
    }

    const result = await executeApiOnTab(tab.id, msg.method, msg.args ?? []);
    respond({ result });
  } catch (e) {
    respond({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function connectBridge(): void {
  if (socket?.readyState === WebSocket.OPEN) return;

  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    socket?.send(JSON.stringify({ role: 'extension' }));
    void publishTabs();
  };

  socket.onmessage = (ev) => {
    let msg: {
      type?: string;
      id?: number;
      method?: string;
      args?: unknown[];
      pageUrlMatch?: string;
    };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.type === 'call' && typeof msg.id === 'number' && msg.method) {
      void handleBridgeCall(msg as Parameters<typeof handleBridgeCall>[0]);
    }
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge();
  }, 2500);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'cocos-page-active') {
    void publishTabs();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.tabs.onUpdated.addListener(() => {
  void publishTabs();
});

connectBridge();
