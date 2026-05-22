import { WebSocket, WebSocketServer } from 'ws';

const DEFAULT_PORT = Number(process.env.COCOS_BRIDGE_PORT ?? 17373);
const CALL_TIMEOUT_MS = 120_000;

/** @type {'none' | 'server' | 'client'} */
let mode = 'none';
/** @type {import('ws').WebSocketServer | null} */
let wss = null;
/** @type {import('ws').WebSocket | null} */
let extensionWs = null;
/** @type {import('ws').WebSocket | null} */
let mcpClientWs = null;
/** @type {Set<import('ws').WebSocket>} */
const mcpClients = new Set();
/** @type {Map<number, { resolve: Function; reject: Function; timer: ReturnType<typeof setTimeout>; relayTo?: import('ws').WebSocket }>} */
const pending = new Map();
let seq = 0;
let lastTabs = [];

function routeResponse(msg) {
  const p = pending.get(msg.id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(msg.id);

  if (p.relayTo && p.relayTo.readyState === WebSocket.OPEN) {
    p.relayTo.send(JSON.stringify(msg));
    return;
  }

  if (msg.error) p.reject(new Error(msg.error));
  else p.resolve(msg.result);
}

/** 其它 MCP 进程经 WebSocket 转发的调用 */
function relayCallFromMcpClient(msg, mcpWs) {
  if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
    mcpWs.send(
      JSON.stringify({
        type: 'response',
        id: msg.id,
        error:
          '扩展未连接桥接。请用普通 Chrome 打开试玩页并确认已加载 Cocos Inspector 扩展。',
      })
    );
    return;
  }

  const timer = setTimeout(() => {
    pending.delete(msg.id);
    if (mcpWs.readyState === WebSocket.OPEN) {
      mcpWs.send(
        JSON.stringify({
          type: 'response',
          id: msg.id,
          error: `桥接调用超时 (${msg.method ?? 'call'})`,
        })
      );
    }
  }, CALL_TIMEOUT_MS);
  pending.set(msg.id, {
    resolve: () => {},
    reject: () => {},
    timer,
    relayTo: mcpWs,
  });

  extensionWs.send(
    JSON.stringify({
      type: 'call',
      id: msg.id,
      method: msg.method,
      args: msg.args ?? [],
      pageUrlMatch: msg.pageUrlMatch ?? '',
    })
  );
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {object} msg
 */
function onSocketMessage(ws, msg) {
  if (msg.role === 'extension') {
    if (extensionWs && extensionWs !== ws && extensionWs.readyState === WebSocket.OPEN) {
      try {
        extensionWs.close();
      } catch {
        /* ignore */
      }
    }
    extensionWs = ws;
    if (Array.isArray(msg.tabs)) lastTabs = msg.tabs;
    return;
  }

  if (msg.role === 'mcp') {
    mcpClients.add(ws);
    if (!mcpClientWs || mcpClientWs.readyState !== WebSocket.OPEN) {
      mcpClientWs = ws;
    }
    return;
  }

  if (msg.type === 'tabs' && Array.isArray(msg.tabs)) {
    lastTabs = msg.tabs;
    return;
  }

  if (msg.type === 'status' || msg.type === 'ping') {
    ws.send(
      JSON.stringify({
        type: 'status',
        extensionConnected: extensionWs?.readyState === WebSocket.OPEN,
        tabs: lastTabs,
        mode,
      })
    );
    return;
  }

  if (msg.type === 'call' && ws !== extensionWs) {
    relayCallFromMcpClient(msg, ws);
    return;
  }

  if (msg.type === 'response') {
    routeResponse(msg);
  }
}

function wireConnection(ws) {
  ws.on('error', () => {
    /* 避免未捕获 error 导致守护进程退出 */
  });
  ws.on('message', (raw) => {
    try {
      onSocketMessage(ws, JSON.parse(String(raw)));
    } catch {
      /* ignore */
    }
  });
  ws.on('close', () => {
    if (extensionWs === ws) extensionWs = null;
    mcpClients.delete(ws);
    if (mcpClientWs === ws) {
      mcpClientWs = null;
      for (const c of mcpClients) {
        if (c.readyState === WebSocket.OPEN) {
          mcpClientWs = c;
          break;
        }
      }
    }
  });
}

function connectBridgeClient(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`连接已有桥接超时 (127.0.0.1:${port})`));
    }, 8000);

    ws.on('open', () => {
      clearTimeout(timer);
      mcpClientWs = ws;
      mcpClients.add(ws);
      mode = 'client';
      wireConnection(ws);
      ws.send(JSON.stringify({ role: 'mcp' }));
      resolve();
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function isBridgeRunning() {
  return mode === 'server' && !!wss;
}

export async function isExtensionConnected() {
  if (mode === 'server') {
    return extensionWs?.readyState === WebSocket.OPEN;
  }
  if (mode === 'client' && mcpClientWs?.readyState === WebSocket.OPEN) {
    try {
      const st = await bridgeGetStatus();
      return !!st.extensionConnected;
    } catch {
      return false;
    }
  }
  return false;
}

export function getLastTabs() {
  return lastTabs;
}

export async function bridgeGetStatus() {
  if (mode === 'client' && mcpClientWs?.readyState === WebSocket.OPEN) {
    return new Promise((resolve, reject) => {
      const handler = (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'status') {
            mcpClientWs.off('message', handler);
            lastTabs = msg.tabs ?? lastTabs;
            resolve(msg);
          }
        } catch {
          /* ignore */
        }
      };
      mcpClientWs.on('message', handler);
      mcpClientWs.send(JSON.stringify({ type: 'status' }));
      setTimeout(() => {
        mcpClientWs?.off('message', handler);
        reject(new Error('status 超时'));
      }, 5000);
    });
  }
  return {
    extensionConnected: extensionWs?.readyState === WebSocket.OPEN,
    tabs: lastTabs,
  };
}

/** 关闭 MCP 客户端连接，便于 CLI 脚本正常退出 */
export function closeBridgeClient() {
  if (mcpClientWs) {
    try {
      mcpClientWs.close();
    } catch {
      /* ignore */
    }
  }
  mcpClientWs = null;
  mcpClients.clear();
  if (mode === 'client') mode = 'none';
}

/** 仅连接已有桥接（供 Cursor MCP 使用，不抢占端口） */
export async function connectBridgeClientOnly(port = DEFAULT_PORT) {
  if (mcpClientWs?.readyState === WebSocket.OPEN) return;
  mcpClientWs = null;
  return connectBridgeClient(port);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询直到扩展连上桥接 */
export async function waitForExtension(maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      await connectBridgeClientOnly(DEFAULT_PORT);
      const st = await bridgeGetStatus();
      if (st.extensionConnected) return st;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(
    `扩展未在 ${maxMs}ms 内连接桥接。请打开试玩页并确认 Inspector 面板 MCP 为已连接。`
  );
}

/** @returns {Promise<void>} */
export function startBridge(port = DEFAULT_PORT) {
  if (mode === 'server' && wss) return Promise.resolve();
  if (mode === 'client' && mcpClientWs?.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port });

    const onListenError = (err) => {
      server.removeListener('error', onListenError);
      if (err.code === 'EADDRINUSE') {
        server.close();
        connectBridgeClient(port).then(resolve).catch(reject);
        return;
      }
      reject(err);
    };

    server.on('error', onListenError);

    server.on('listening', () => {
      server.removeListener('error', onListenError);
      wss = server;
      mode = 'server';
      server.on('connection', wireConnection);
      resolve();
    });
  });
}

/**
 * @param {string} method
 * @param {unknown[]} argList
 * @param {{ pageUrlMatch?: string }} opts
 */
export function bridgeApiCall(method, argList = [], opts = {}) {
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

    if (mode === 'client') {
      if (!mcpClientWs || mcpClientWs.readyState !== WebSocket.OPEN) {
        clearTimeout(timer);
        reject(new Error('MCP 桥接客户端未连接'));
        return;
      }
      pending.set(id, { resolve, reject, timer });
      mcpClientWs.send(JSON.stringify(payload));
      return;
    }

    if (mode !== 'server') {
      clearTimeout(timer);
      reject(new Error('桥接未启动'));
      return;
    }

    pending.set(id, { resolve, reject, timer });

    if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
      clearTimeout(timer);
      pending.delete(id);
      reject(
        new Error(
          '扩展未连接 MCP 桥接。请用普通 Chrome 打开试玩页并确认扩展已加载。'
        )
      );
      return;
    }

    extensionWs.send(JSON.stringify(payload));
  });
}

/** 整页截屏（扩展 chrome.tabs.captureVisibleTab） */
export async function bridgeCaptureVisibleTab(pageUrlMatch) {
  return bridgeApiCall('__captureVisibleTab', [], { pageUrlMatch });
}
