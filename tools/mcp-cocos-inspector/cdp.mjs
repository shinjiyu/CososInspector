import CDP from 'chrome-remote-interface';

/** @type {import('chrome-remote-interface').Client | null} */
let client = null;
let connectedUrl = '';

/**
 * @param {{ port?: number; pageUrlMatch?: string }} opts
 */
export async function ensureConnected(opts = {}) {
  const port = Number(opts.port ?? process.env.COCOS_CDP_PORT ?? 9222);
  const match = String(
    opts.pageUrlMatch ?? process.env.COCOS_PAGE_URL_MATCH ?? ''
  ).toLowerCase();

  if (client && (!match || connectedUrl.toLowerCase().includes(match))) {
    return client;
  }

  if (client) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    client = null;
  }

  const targets = await CDP.List({ port });
  const pages = targets.filter((t) => t.type === 'page' && t.url && !t.url.startsWith('chrome-extension://'));
  let pick = pages.find((t) => match && t.url.toLowerCase().includes(match));
  if (!pick) pick = pages.find((t) => t.url.includes('http'));
  if (!pick) {
    throw new Error(
      `未找到试玩页标签（port=${port}, match=${match || '(任意 http)'}）。请先以 --remote-debugging-port=${port} 启动 Chrome 并打开游戏页。`
    );
  }

  client = await CDP({ target: pick, port });
  connectedUrl = pick.url;
  const { Runtime, Page } = client;
  await Runtime.enable();
  await Page.enable();
  return client;
}

export function getConnectedPageUrl() {
  return connectedUrl;
}

/**
 * @param {string} fnBody async IIFE body, e.g. `return await window.__cocosInspectorApi.listSprites()`
 * @param {{ port?: number; pageUrlMatch?: string }} opts
 */
export async function invokeInPage(fnBody, opts = {}) {
  await ensureConnected(opts);
  const { Runtime } = client;
  const expression = `(async () => { ${fnBody} })()`;
  const res = await Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (res.exceptionDetails) {
    const text =
      res.exceptionDetails.exception?.description ??
      res.exceptionDetails.text ??
      JSON.stringify(res.exceptionDetails);
    throw new Error(`页面脚本错误: ${text}`);
  }

  return res.result?.value;
}

export async function captureTabScreenshot(opts = {}) {
  await ensureConnected(opts);
  const { Page } = client;
  const shot = await Page.captureScreenshot({ format: 'png' });
  return shot.data;
}
