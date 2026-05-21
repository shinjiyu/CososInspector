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
