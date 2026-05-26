/**
 * 在本地服务进程内导出替换包（经 WS 桥拉取试玩页数据并写盘）
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { bridgeApiCall, bridgeGetStatus } from './bridge-server.mjs';
import { getShareDir, resolveSharePath } from './shared-fs.mjs';
import { buildRepackCommand, projectPackDir } from './repack-hints.mjs';
import { runRepackForPack } from './repack-run.mjs';

/**
 * @param {{ pageUrlMatch?: string; repack?: boolean }} opts
 */
export async function exportPackViaBridge(opts = {}) {
  const pageUrlMatch =
    opts.pageUrlMatch ?? process.env.COCOS_PAGE_URL_MATCH ?? 'applovin';

  const status = await bridgeGetStatus();
  if (!status.extensionConnected) {
    return {
      ok: false,
      error:
        '扩展未连接本地服务。请运行 npm run cocos-bridge，打开试玩页并 F5，确认 MCP 绿点。',
    };
  }

  const begin = await bridgeApiCall('beginReplacementPackExport', [], {
    pageUrlMatch,
  });
  if (!begin?.ok) {
    return { ok: false, error: begin?.error ?? 'beginReplacementPackExport 失败' };
  }

  const { prefix, paths, pageUrl, replacementCount } = begin.data;
  const packRoot = `out/${prefix}`;
  const packDirAbs = resolveSharePath(packRoot);

  for (const rel of paths) {
    const chunk = await bridgeApiCall('readReplacementPackFile', [rel], {
      pageUrlMatch,
    });
    if (!chunk?.ok) {
      return {
        ok: false,
        error: chunk?.error ?? `readReplacementPackFile(${rel}) 失败`,
      };
    }
    const dest = join(packDirAbs, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(chunk.base64, 'base64'));
  }

  const packDirRel = projectPackDir(prefix);
  const repackCommand = buildRepackCommand({ pageUrl, packDir: packDirRel });

  const data = {
    prefix,
    packRoot,
    packDir: packDirRel,
    packDirAbs,
    shareDir: getShareDir(),
    pageUrl,
    replacementCount,
    fileCount: paths.length,
    repackCommand,
    repacked: false,
    repackedHtml: '',
    repackedHtmlAbs: '',
    previewHint: 'npx serve tmp/mcp-share/out',
    nextStep: '',
  };

  const doRepack = opts.repack !== false;
  if (doRepack) {
    const repacked = runRepackForPack({
      packDirAbs,
      packDirRel,
      pageUrl,
    });
    if (!repacked.ok) {
      return {
        ok: false,
        error: `替换包已导出，但重打包失败: ${repacked.error}`,
        partial: data,
      };
    }
    data.repacked = true;
    data.repackedHtml = repacked.repackedHtmlRel;
    data.repackedHtmlAbs = repacked.repackedHtmlAbs;
    data.previewHint = repacked.previewHint;
    data.nextStep = `已生成 ${repacked.repackedHtmlRel}；预览: ${repacked.previewHint}`;
  } else {
    data.nextStep = repackCommand;
  }

  return { ok: true, data };
}
