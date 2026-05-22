import { collectPageResources } from './pageResources';
import { buildRepackCommand, buildRepackReadmeSection } from './repackHints';
import {
  getReplacementBlob,
  listReplacementPairs,
  type StoredReplacementPair,
} from './replacementStore';

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
      '试玩页内上传替换仅用于预览；换皮请用本地重打包。',
      '1. 将 manifest 与 images 放在同一目录（或保持浏览器扁平下载到同一文件夹）',
      '2. super-html: node tools/repack-super-html.mjs --html <原版试玩.html> --pack <本包目录>',
      '   图集子帧：manifest 含 frameRect 时自动合成进 native PNG；整图则覆盖对应 jpg/png',
      '3. 整站目录: node tools/apply-replacements.mjs --source <下载目录> --pack <本包目录>',
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
    const pageUrl = window.location.href;
    const packDirHint = `./${prefix}`;
    const repackCmd = buildRepackCommand({ pageUrl, packDir: packDirHint });
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
    const packDirHint = './cocos-replacements_export';
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

/** 依次下载 manifest、page-resources、每张替换图（浏览器会多次保存对话框） */
export async function exportReplacementPack(): Promise<
  | { ok: true; count: number; prefix: string; repackCommand: string }
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
    triggerDownloadJson(manifest, `${prefix}/manifest.json`);

    const pageRes = collectPageResources();
    triggerDownloadJson(pageRes, `${prefix}/page-resources.json`);

    const packDirHint = `./${prefix}`;
    const repackCmd = buildRepackCommand({
      pageUrl,
      packDir: packDirHint,
    });

    const readme = [
      'Cocos Inspector 3 — 替换包',
      '',
      `页面: ${pageUrl}`,
      `导出时间: ${manifest.exportedAt}`,
      `替换对数量: ${pairs.length}`,
      '',
      '将本批下载文件放在同一文件夹（扁平即可），例如项目内 tmp/',
      '',
      ...manifest.applyInstructions,
      '',
      ...buildRepackReadmeSection({
        pageUrl,
        packDir: packDirHint,
        count: pairs.length,
      }),
      '--- page-resources 下载提示 ---',
      ...pageRes.wgetHints,
    ].join('\n');
    triggerDownload(
      new Blob([readme], { type: 'text/plain;charset=utf-8' }),
      `${prefix}/README.txt`
    );

    for (const pair of pairs) {
      const blob = await getReplacementBlob(pair.id);
      if (!blob) continue;
      triggerDownload(blob, `${prefix}/images/${pair.replacement.exportFileName}`);
    }

    triggerDownload(
      new Blob([repackCmd + '\n'], { type: 'text/plain;charset=utf-8' }),
      `${prefix}/repack-command.txt`
    );

    return { ok: true, count: pairs.length, prefix, repackCommand: repackCmd };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function exportPageResourcesOnly(): void {
  const pageRes = collectPageResources();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  triggerDownloadJson(pageRes, `cocos-page-resources_${stamp}.json`);
}
