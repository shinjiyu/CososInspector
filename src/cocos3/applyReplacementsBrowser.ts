import {
  collectReplacementAssetUrls,
  findUrlKeyInMap,
  isImageAssetUrl,
} from './replacementAssetUrls';
import type { StoredReplacementPair } from './replacementStore';

export interface SiteFileEntry {
  path: string;
  bytes: Uint8Array;
  isImage: boolean;
  isText: boolean;
}

export interface ApplyReplacementsResult {
  applied: number;
  log: string[];
  missed: string[];
}

function normalizeKey(s: string): string {
  try {
    return decodeURIComponent(String(s)).toLowerCase();
  } catch {
    return String(s).toLowerCase();
  }
}

function basename(path: string): string {
  const clean = path.split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || clean;
}

export function fileMatchesKey(filePath: string, key: string): boolean {
  const base = basename(filePath);
  const nk = normalizeKey(key);
  if (normalizeKey(base) === nk) return true;
  if (normalizeKey(base).includes(nk) && nk.length >= 6) return true;
  return false;
}

function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

function isTextPath(p: string): boolean {
  return /\.(json|js|html|plist|atlas|txt|xml|css)$/i.test(p);
}

function buildKeys(rep: StoredReplacementPair): string[] {
  return [
    ...rep.matchKeys,
    rep.original.frameName,
    rep.original.textureName,
    rep.original.textureUuid,
    ...rep.original.assetUrls.map((u) => basename(String(u))),
  ].filter((k) => k && String(k).length >= 2);
}

export function findReplacementTargetPaths(
  files: Map<string, SiteFileEntry>,
  rep: StoredReplacementPair,
  options?: { pageUrl?: string; urlToPath?: Map<string, string> }
): string[] {
  const keys = buildKeys(rep);
  const targets = new Set<string>();

  if (options?.pageUrl && options.urlToPath) {
    for (const raw of rep.original.assetUrls) {
      try {
        const abs = new URL(raw, options.pageUrl).href;
        const path = options.urlToPath.get(abs);
        if (path) targets.add(path);
      } catch {
        /* ignore */
      }
    }
  }

  for (const key of keys) {
    for (const [path, file] of files) {
      if (file.isImage && fileMatchesKey(path, key)) {
        targets.add(path);
      }
    }
  }

  for (const key of keys) {
    for (const [path, file] of files) {
      if (!file.isText) continue;
      let text: string;
      try {
        text = new TextDecoder().decode(file.bytes);
      } catch {
        continue;
      }
      if (!text.includes(key)) continue;

      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      for (const [imgPath, imgFile] of files) {
        if (!imgFile.isImage) continue;
        const inDir =
          dir === '' ||
          imgPath.startsWith(`${dir}/`) ||
          imgPath.slice(0, imgPath.lastIndexOf('/')) === dir;
        if (!inDir) continue;
        if (fileMatchesKey(imgPath, key) || basename(imgPath).includes(basename(key))) {
          targets.add(imgPath);
        }
      }
    }
  }

  return [...targets];
}

/** 按记录中的 assetUrls 直接覆盖已下载资源（最可靠） */
function applyByDirectAssetUrls(
  files: Map<string, SiteFileEntry>,
  urlToBytes: Map<string, Uint8Array>,
  urlToPath: Map<string, string> | undefined,
  rep: StoredReplacementPair,
  bytes: Uint8Array,
  pageUrl: string,
  log: string[]
): number {
  let n = 0;
  const seen = new Set<string>();

  const candidateUrls = collectReplacementAssetUrls([rep], pageUrl);
  for (const abs of candidateUrls) {
    if (!isImageAssetUrl(abs)) continue;

    const key = findUrlKeyInMap(urlToBytes, abs);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    urlToBytes.set(key, bytes);
    const path = urlToPath?.get(key) ?? urlToPath?.get(abs);
    if (path) {
      const entry = files.get(path);
      files.set(path, {
        path,
        bytes,
        isImage: true,
        isText: entry?.isText ?? false,
      });
    }
    log.push(`${key} ← ${rep.replacement.exportFileName}`);
    n++;
  }

  return n;
}

/** 在内存文件表上应用所有替换对（与 Node 脚本逻辑一致） */
export function applyReplacementsToFileMap(
  files: Map<string, SiteFileEntry>,
  pairs: StoredReplacementPair[],
  replacementBytesById: Map<string, Uint8Array>,
  options?: {
    pageUrl?: string;
    urlToPath?: Map<string, string>;
    pathToUrl?: Map<string, string>;
    urlToBytes?: Map<string, Uint8Array>;
  }
): ApplyReplacementsResult {
  const log: string[] = [];
  const missed: string[] = [];
  let applied = 0;
  const pageUrl = options?.pageUrl ?? window.location.href;

  for (const rep of pairs) {
    const bytes = replacementBytesById.get(rep.id);
    if (!bytes) {
      missed.push(`${rep.nodePath}: 缺少替换图`);
      continue;
    }

    let count = 0;
    if (options?.urlToBytes) {
      count = applyByDirectAssetUrls(
        files,
        options.urlToBytes,
        options.urlToPath,
        rep,
        bytes,
        pageUrl,
        log
      );
      applied += count;
    }

    if (count > 0) continue;

    const targets = findReplacementTargetPaths(files, rep, options);
    if (targets.length === 0) {
      const hint =
        rep.original.assetUrls.length > 0
          ? '资源 URL 未下载成功'
          : '无资源 URL，仅运行时有效';
      missed.push(`${rep.nodePath} (${rep.original.frameName}): ${hint}`);
      continue;
    }

    for (const path of targets) {
      const entry = files.get(path);
      if (!entry) continue;
      files.set(path, {
        ...entry,
        bytes,
        isImage: true,
      });
      const url = options?.pathToUrl?.get(path);
      if (url && options.urlToBytes) options.urlToBytes.set(url, bytes);
      log.push(`${path} ← ${rep.replacement.exportFileName}`);
      applied++;
    }
  }

  return { applied, log, missed };
}

export function classifySitePath(path: string): { isImage: boolean; isText: boolean } {
  return {
    isImage: isImagePath(path),
    isText: isTextPath(path),
  };
}
