/** 纹理提取诊断日志：写入 localStorage，经 MCP bridge 读取（不输出浏览器 console） */

export type TextureExtractLogLevel = 'info' | 'warn' | 'error';

export interface TextureExtractLogEntry {
  ts: number;
  level: TextureExtractLogLevel;
  nodeName: string;
  nodeUUID: string;
  frameName: string;
  message: string;
  method?: string;
  cacheHit?: boolean;
  frameRect?: { x: number; y: number; w: number; h: number };
  pixelSize?: { w: number; h: number };
  detail?: Record<string, unknown>;
}

const LS_KEY = 'cocos-inspector-texture-logs';
const MAX_ENTRIES = 400;

const ring: TextureExtractLogEntry[] = [];

const formatCtx = (nodeName: string, nodeUUID: string): string =>
  `${nodeName}(${nodeUUID})`;

const persist = (): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ring));
  } catch {
    /* 配额满时丢弃最旧一半再试 */
    try {
      ring.splice(0, Math.floor(ring.length / 2));
      localStorage.setItem(LS_KEY, JSON.stringify(ring));
    } catch {
      /* ignore */
    }
  }
};

export const appendTextureExtractLog = (
  entry: Omit<TextureExtractLogEntry, 'ts'> & { ts?: number }
): void => {
  const row: TextureExtractLogEntry = {
    ts: entry.ts ?? Date.now(),
    level: entry.level,
    nodeName: entry.nodeName,
    nodeUUID: entry.nodeUUID,
    frameName: entry.frameName,
    message: entry.message,
    method: entry.method,
    cacheHit: entry.cacheHit,
    frameRect: entry.frameRect,
    pixelSize: entry.pixelSize,
    detail: entry.detail,
  };
  ring.push(row);
  while (ring.length > MAX_ENTRIES) {
    ring.shift();
  }
  persist();
};

export const getTextureExtractLogs = (options?: {
  limit?: number;
  since?: number;
  nodeUUID?: string;
}): TextureExtractLogEntry[] => {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), MAX_ENTRIES);
  let rows = [...ring];
  if (options?.since) {
    rows = rows.filter((r) => r.ts >= options.since!);
  }
  if (options?.nodeUUID) {
    rows = rows.filter((r) => r.nodeUUID === options.nodeUUID);
  }
  return rows.slice(-limit);
};

export const clearTextureExtractLogs = (): { cleared: number } => {
  const n = ring.length;
  ring.length = 0;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  return { cleared: n };
};

/** 页面 reload 后从 localStorage 恢复 ring */
export const hydrateTextureExtractLogs = (): void => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as TextureExtractLogEntry[];
    if (!Array.isArray(parsed)) return;
    ring.length = 0;
    for (const row of parsed.slice(-MAX_ENTRIES)) {
      if (row?.nodeUUID && row?.message) ring.push(row);
    }
  } catch {
    /* ignore */
  }
};

export const logTextureExtract = (
  ctx: { nodeName: string; nodeUUID: string; frameName: string },
  message: string,
  extra?: Partial<
    Pick<
      TextureExtractLogEntry,
      'level' | 'method' | 'cacheHit' | 'frameRect' | 'pixelSize' | 'detail'
    >
  >
): void => {
  appendTextureExtractLog({
    level: extra?.level ?? 'info',
    nodeName: ctx.nodeName,
    nodeUUID: ctx.nodeUUID,
    frameName: ctx.frameName,
    message: `[纹理提取:${formatCtx(ctx.nodeName, ctx.nodeUUID)}] ${message}`,
    method: extra?.method,
    cacheHit: extra?.cacheHit,
    frameRect: extra?.frameRect,
    pixelSize: extra?.pixelSize,
    detail: extra?.detail,
  });
};

hydrateTextureExtractLogs();
