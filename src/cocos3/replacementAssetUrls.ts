import type { StoredReplacementPair } from './replacementStore';

/** 将记录中的资源地址规范为可 fetch 的绝对 URL */
export function normalizeAssetUrl(raw: string, pageUrl: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (
    s.startsWith('blob:') ||
    s.startsWith('data:') ||
    s.startsWith('db://') ||
    s.startsWith('javascript:')
  ) {
    return null;
  }
  try {
    return new URL(s, pageUrl).href;
  } catch {
    return null;
  }
}

/** 收集替换对关联的远程资源 URL（含运行时解析 UUID） */
export function collectReplacementAssetUrls(
  pairs: StoredReplacementPair[],
  pageUrl: string
): string[] {
  const out = new Set<string>();

  const ccg = window.cc as {
    assetManager?: {
      utils?: {
        getUrlWithUuid?: (
          uuid: string,
          opts?: { isNative?: boolean; ext?: string }
        ) => string;
      };
    };
  };
  const getUrl = ccg.assetManager?.utils?.getUrlWithUuid;

  for (const pair of pairs) {
    for (const raw of pair.original.assetUrls) {
      const abs = normalizeAssetUrl(raw, pageUrl);
      if (abs) out.add(abs);
    }

    const uuid = pair.original.textureUuid;
    if (!uuid || !getUrl) continue;

    for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '']) {
      try {
        const u = getUrl(uuid, ext ? { isNative: true, ext } : { isNative: true });
        const abs = normalizeAssetUrl(u, pageUrl);
        if (abs) out.add(abs);
      } catch {
        /* ignore */
      }
    }
  }

  return [...out];
}

export function isImageAssetUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url.split('?')[0]);
}

/** 在 urlToBytes 中查找与目标 URL 等价的键（忽略 query、编码差异） */
export function findUrlKeyInMap(
  urlToBytes: Map<string, Uint8Array>,
  abs: string
): string | null {
  if (urlToBytes.has(abs)) return abs;

  try {
    const target = new URL(abs);
    const targetPath = decodeURIComponent(target.pathname);
    const targetBase = targetPath.split('/').pop() ?? '';

    for (const key of urlToBytes.keys()) {
      try {
        const u = new URL(key);
        if (u.origin !== target.origin) continue;
        if (decodeURIComponent(u.pathname) === targetPath) return key;
        if (targetBase && decodeURIComponent(u.pathname).endsWith(`/${targetBase}`)) {
          return key;
        }
      } catch {
        if (key === abs || key.split('?')[0] === abs.split('?')[0]) return key;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}
