import JSZip from 'jszip';
import { collectPageResources } from './pageResources';
import { buildRepackCommand, buildRepackReadmeSection } from './repackHints';
import {
  getReplacementBlob,
  listReplacementPairs,
  type StoredReplacementPair,
} from './replacementStore';

/** 与 tools/mcp-cocos-inspector/shared-fs 默认一致 */
export const DEFAULT_SHARE_HTTP_PORT = 17374;

/** 项目内固定导出目录（相对仓库根） */
export function projectPackDir(prefix: string): string {
  return `tmp/mcp-share/out/${prefix}`;
}

let activeExportPrefix: string | null = null;

async function isShareHttpAvailable(
  shareBaseUrl = `http://127.0.0.1:${DEFAULT_SHARE_HTTP_PORT}`
): Promise<boolean> {
  try {
    const r = await fetch(`${shareBaseUrl.replace(/\/$/, '')}/`, {
      method: 'OPTIONS',
    });
    return r.ok || r.status === 204 || r.status === 404;
  } catch {
    return false;
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerDownloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  triggerDownload(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
    filename
  );
}

export interface ExportManifest {
  version: 1;
  exportedAt: string;
  pageUrl: string;
  replacements: Array<
    StoredReplacementPair & {
      imageFile: string;
    }
  >;
  applyInstructions: string[];
}

export async function exportReplacementManifest(): Promise<ExportManifest> {
  const pairs = await listReplacementPairs();
  const replacements = pairs.map((p) => ({
    ...p,
    imageFile: `images/${p.replacement.exportFileName}`,
  }));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    replacements,
    applyInstructions: [
      '试玩页内上传替换仅用于预览；换皮请用 Web 打包站或 Node 重打包。',
      '1. 本文件为 zip 内的 manifest.json；整包为 cocos-replacements_*.zip',
      '2. 打开换皮打包站 http://127.0.0.1:8787 上传 zip + 原版试玩 html（或试玩 URL）',
      '3. 下载 repacked_*.zip，解压后 npx serve . 预览（勿用 file://）',
    ],
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface ReplacementPackExportData {
  prefix: string;
  pageUrl: string;
  repackCommand: string;
  manifest: ExportManifest;
  readme: string;
  pageResources: ReturnType<typeof collectPageResources>;
  files: Array<{ path: string; base64: string; mimeType: string }>;
}

export interface ReplacementPackBegin {
  prefix: string;
  pageUrl: string;
  repackCommand: string;
  paths: string[];
  replacementCount: number;
}

/** 分片导出：先取文件列表（避免单次 JSON 过大撑爆扩展消息通道） */
export async function beginReplacementPackExport(): Promise<
  | { ok: true; data: ReplacementPackBegin }
  | { ok: false; error: string }
> {
  try {
    const pairs = await listReplacementPairs();
    if (pairs.length === 0) {
      return { ok: false, error: '当前页面没有已记录的替换对' };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = `cocos-replacements_${stamp}`;
    activeExportPrefix = prefix;
    const pageUrl = window.location.href;
    const repackCmd = buildRepackCommand({
      pageUrl,
      packDir: projectPackDir(prefix),
    });
    const paths = [
      'manifest.json',
      'page-resources.json',
      'README.txt',
      'repack-command.txt',
      ...pairs.map((p) => `images/${p.replacement.exportFileName}`),
    ];
    return {
      ok: true,
      data: {
        prefix,
        pageUrl,
        repackCommand: repackCmd,
        paths,
        replacementCount: pairs.length,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function readReplacementPackFileBlob(
  relativePath: string
): Promise<
  | { ok: true; path: string; blob: Blob; mimeType: string }
  | { ok: false; error: string }
> {
  const chunk = await readReplacementPackFile(relativePath);
  if (!chunk.ok) return chunk;
  const bin = atob(chunk.base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return {
    ok: true,
    path: chunk.path,
    blob: new Blob([arr], { type: chunk.mimeType }),
    mimeType: chunk.mimeType,
  };
}

/**
 * 导出替换包到桥接共享目录（HTTP PUT），WebSocket 只返回路径元数据。
 * 文件落在 shareRoot/out/{prefix}/...
 */
export async function exportReplacementPackToShare(
  shareBaseUrl = 'http://127.0.0.1:17374'
): Promise<
  | {
      ok: true;
      data: ReplacementPackBegin & {
        packRoot: string;
        shareBaseUrl: string;
      };
    }
  | { ok: false; error: string }
> {
  try {
    const begin = await beginReplacementPackExport();
    if (!begin.ok) return begin;

    const base = shareBaseUrl.replace(/\/$/, '');
    const { prefix, paths, repackCommand, pageUrl, replacementCount } =
      begin.data;
    const packRoot = `out/${prefix}`;

    for (const rel of paths) {
      const file = await readReplacementPackFileBlob(rel);
      if (!file.ok) return file;

      const url = `${base}/${packRoot}/${rel}`;
      const put = await fetch(url, {
        method: 'PUT',
        body: file.blob,
        headers: file.mimeType ? { 'Content-Type': file.mimeType } : undefined,
      });
      if (!put.ok) {
        return {
          ok: false,
          error: `写入共享目录失败 ${rel}: HTTP ${put.status}`,
        };
      }
    }

    return {
      ok: true,
      data: {
        prefix,
        pageUrl,
        repackCommand,
        paths,
        replacementCount,
        packRoot,
        shareBaseUrl: base,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 分片导出：按相对路径读取单个文件（base64） */
export async function readReplacementPackFile(
  relativePath: string
): Promise<
  | { ok: true; path: string; base64: string; mimeType: string }
  | { ok: false; error: string }
> {
  try {
    const path = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const pairs = await listReplacementPairs();
    if (pairs.length === 0) {
      return { ok: false, error: '当前页面没有已记录的替换对' };
    }

    const pageUrl = window.location.href;
    const manifest = await exportReplacementManifest();
    const pageResources = collectPageResources();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = activeExportPrefix ?? `cocos-replacements_${stamp}`;
    const packDirHint = projectPackDir(prefix);
    const repackCmd = buildRepackCommand({ pageUrl, packDir: packDirHint });
    const readme = [
      'Cocos Inspector 3 — 替换包',
      '',
      `页面: ${pageUrl}`,
      `导出时间: ${manifest.exportedAt}`,
      `替换对数量: ${pairs.length}`,
      '',
      ...manifest.applyInstructions,
      '',
      ...buildRepackReadmeSection({
        pageUrl,
        packDir: packDirHint,
        count: pairs.length,
      }),
    ].join('\n');

    if (path === 'manifest.json') {
      return {
        ok: true,
        path,
        base64: btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2)))),
        mimeType: 'application/json',
      };
    }
    if (path === 'page-resources.json') {
      return {
        ok: true,
        path,
        base64: btoa(
          unescape(encodeURIComponent(JSON.stringify(pageResources, null, 2)))
        ),
        mimeType: 'application/json',
      };
    }
    if (path === 'README.txt') {
      return {
        ok: true,
        path,
        base64: btoa(unescape(encodeURIComponent(readme))),
        mimeType: 'text/plain',
      };
    }
    if (path === 'repack-command.txt') {
      return {
        ok: true,
        path,
        base64: btoa(unescape(encodeURIComponent(repackCmd + '\n'))),
        mimeType: 'text/plain',
      };
    }
    if (path.startsWith('images/')) {
      const fileName = path.slice('images/'.length);
      const pair = pairs.find((p) => p.replacement.exportFileName === fileName);
      if (!pair) {
        return { ok: false, error: `未找到替换图: ${fileName}` };
      }
      const blob = await getReplacementBlob(pair.id);
      if (!blob) {
        return { ok: false, error: `替换图数据缺失: ${pair.id}` };
      }
      return {
        ok: true,
        path,
        base64: await blobToBase64(blob),
        mimeType: blob.type || 'image/png',
      };
    }
    return { ok: false, error: `未知路径: ${path}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 返回替换包数据（供 MCP 写入磁盘，不触发浏览器下载） */
export async function exportReplacementPackData(): Promise<
  | { ok: true; data: ReplacementPackExportData }
  | { ok: false; error: string }
> {
  try {
    const pairs = await listReplacementPairs();
    if (pairs.length === 0) {
      return { ok: false, error: '当前页面没有已记录的替换对' };
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = `cocos-replacements_${stamp}`;
    const pageUrl = window.location.href;
    const manifest = await exportReplacementManifest();
    const pageResources = collectPageResources();
    const packDirHint = `./${prefix}`;
    const repackCmd = buildRepackCommand({ pageUrl, packDir: packDirHint });

    const readme = [
      'Cocos Inspector 3 — 替换包',
      '',
      `页面: ${pageUrl}`,
      `导出时间: ${manifest.exportedAt}`,
      `替换对数量: ${pairs.length}`,
      '',
      ...manifest.applyInstructions,
      '',
      ...buildRepackReadmeSection({
        pageUrl,
        packDir: packDirHint,
        count: pairs.length,
      }),
    ].join('\n');

    const files: ReplacementPackExportData['files'] = [
      {
        path: 'manifest.json',
        base64: btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2)))),
        mimeType: 'application/json',
      },
      {
        path: 'page-resources.json',
        base64: btoa(
          unescape(encodeURIComponent(JSON.stringify(pageResources, null, 2)))
        ),
        mimeType: 'application/json',
      },
      {
        path: 'README.txt',
        base64: btoa(unescape(encodeURIComponent(readme))),
        mimeType: 'text/plain',
      },
      {
        path: 'repack-command.txt',
        base64: btoa(unescape(encodeURIComponent(repackCmd + '\n'))),
        mimeType: 'text/plain',
      },
    ];

    for (const pair of pairs) {
      const blob = await getReplacementBlob(pair.id);
      if (!blob) continue;
      files.push({
        path: `images/${pair.replacement.exportFileName}`,
        base64: await blobToBase64(blob),
        mimeType: blob.type || 'image/png',
      });
    }

    return {
      ok: true,
      data: {
        prefix,
        pageUrl,
        repackCommand: repackCmd,
        manifest,
        readme,
        pageResources,
        files,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 生成替换包 zip（根目录含 manifest.json、images/、README.txt 等） */
export async function buildReplacementPackZip(): Promise<
  | {
      ok: true;
      zipBlob: Blob;
      zipName: string;
      prefix: string;
      count: number;
      repackCommand: string;
    }
  | { ok: false; error: string }
> {
  try {
    const begin = await beginReplacementPackExport();
    if (!begin.ok) return begin;

    const { prefix, paths, pageUrl } = begin.data;
    const packDir = projectPackDir(prefix);
    const repackCmd = buildRepackCommand({ pageUrl, packDir });
    const zip = new JSZip();

    for (const rel of paths) {
      const file = await readReplacementPackFileBlob(rel);
      if (!file.ok) return file;
      zip.file(rel, file.blob);
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const zipName = `${prefix}.zip`;

    return {
      ok: true,
      zipBlob,
      zipName,
      prefix,
      count: begin.data.replacementCount,
      repackCommand: repackCmd,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type ReplacementPackZipResult =
  | {
      ok: true;
      count: number;
      prefix: string;
      zipName: string;
      repackCommand: string;
    }
  | { ok: false; error: string };

/** 下载替换包 zip（插件面板默认入口） */
export async function exportReplacementPack(): Promise<ReplacementPackZipResult> {
  const built = await buildReplacementPackZip();
  if (!built.ok) return built;
  triggerDownload(built.zipBlob, built.zipName);
  return {
    ok: true,
    count: built.count,
    prefix: built.prefix,
    zipName: built.zipName,
    repackCommand: built.repackCommand,
  };
}

/** @alias exportReplacementPack */
export const exportReplacementPackAsZip = exportReplacementPack;

/** 供 MCP：返回 zip base64，不触发浏览器下载 */
export async function exportReplacementPackZipData(): Promise<
  | {
      ok: true;
      data: {
        zipBase64: string;
        zipName: string;
        prefix: string;
        replacementCount: number;
        repackCommand: string;
        mimeType: string;
      };
    }
  | { ok: false; error: string }
> {
  const built = await buildReplacementPackZip();
  if (!built.ok) return built;
  const zipBase64 = await blobToBase64(built.zipBlob);
  return {
    ok: true,
    data: {
      zipBase64,
      zipName: built.zipName,
      prefix: built.prefix,
      replacementCount: built.count,
      repackCommand: built.repackCommand,
      mimeType: 'application/zip',
    },
  };
}

export function exportPageResourcesOnly(): void {
  const pageRes = collectPageResources();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  triggerDownloadJson(pageRes, `cocos-page-resources_${stamp}.json`);
}
