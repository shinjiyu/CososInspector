import { WebSocketServer } from 'ws';

const DEFAULT_PORT = Number(process.env.COCOS_BRIDGE_PORT ?? 17373);
const CALL_TIMEOUT_MS = 120_000;

/** @type {import('ws').WebSocket | null} */
let extensionWs = null;
/** @type {Map<number, { resolve: Function, reject: Function, timer: ReturnType<typeof setTimeout> }>} */
const pending = new Map();
let seq = 0;
/** @type {import('ws').WebSocketServer | null} */
let wss = null;
let lastTabs = [];

export function isBridgeRunning() {
  return !!wss;
}

export function isExtensionConnected() {
  return extensionWs?.readyState === 1;
}

export function getLastTabs() {
  return lastTabs;
}

export function startBridge(port = DEFAULT_PORT) {
  if (wss) return wss;

  wss = new WebSocketServer({ host: '127.0.0.1', port });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.role === 'extension') {
        extensionWs = ws;
        if (Array.isArray(msg.tabs)) lastTabs = msg.tabs;
        return;
      }

      if (msg.type === 'tabs' && Array.isArray(msg.tabs)) {
        lastTabs = msg.tabs;
        return;
      }

      if (msg.type === 'response' && typeof msg.id === 'number') {
        const p = pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      }
    });

    ws.on('close', () => {
      if (extensionWs === ws) extensionWs = null;
    });
  });

  return wss;
}

/**
 * @param {string} method
 * @param {unknown[]} argList
 * @param {{ pageUrlMatch?: string }} opts
 */
export function bridgeApiCall(method, argList = [], opts = {}) {
  if (!extensionWs || extensionWs.readyState !== 1) {
    throw new Error(
      '扩展未连接 MCP 桥接。请：1) 在 Cursor 启用 cocos-inspector MCP；2) 用普通 Chrome 打开试玩页；3) 确认扩展已加载。'
    );
  }

  const id = ++seq;
  const payload = {
    type: 'call',
    id,
    method,
    args: argList,
    pageUrlMatch: opts.pageUrlMatch ?? process.env.COCOS_PAGE_URL_MATCH ?? '',
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`桥接调用超时 (${method})`));
    }, CALL_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    extensionWs.send(JSON.stringify(payload));
  });
}

/** 整页截屏（扩展 chrome.tabs.captureVisibleTab，无需 CDP） */
export async function bridgeCaptureVisibleTab(pageUrlMatch) {
  return bridgeApiCall('__captureVisibleTab', [], { pageUrlMatch });
}
