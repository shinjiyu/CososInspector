import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  bridgeApiCall,
  connectBridgeClientOnly,
  waitForExtension,
} from './bridge-server.mjs';

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));

/**
 * 分片拉取替换包并写入磁盘（单文件 JSON，避免扩展消息通道撑爆）
 * @param {{ pageUrlMatch?: string; outDir?: string; waitMs?: number }} opts
 */
export async function writeReplacementPackToDisk(opts = {}) {
  const match = opts.pageUrlMatch ?? process.env.COCOS_PAGE_URL_MATCH ?? 'applovin';
  const waitMs = opts.waitMs ?? 60_000;

  await waitForExtension(waitMs);
  await connectBridgeClientOnly();

  let begin;
  try {
    begin = await bridgeApiCall('beginReplacementPackExport', [], {
      pageUrlMatch: match,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/未知 API|not a function/i.test(msg)) {
      throw new Error(
        `${msg} — 请在 chrome://extensions 重载 Cocos Inspector 后 F5 试玩页`
      );
    }
    throw e;
  }
  if (!begin?.ok) {
    throw new Error(begin?.error ?? 'beginReplacementPackExport 失败');
  }

  const { prefix, paths, repackCommand, pageUrl, replacementCount } = begin.data;
  const outDir = resolve(opts.outDir ?? join(repoRoot, 'tmp', prefix));
  mkdirSync(outDir, { recursive: true });

  for (const relPath of paths) {
    const chunk = await bridgeApiCall('readReplacementPackFile', [relPath], {
      pageUrlMatch: match,
    });
    if (!chunk?.ok) {
      throw new Error(chunk?.error ?? `readReplacementPackFile(${relPath}) 失败`);
    }
    const dest = join(outDir, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(chunk.base64, 'base64'));
  }

  return {
    outDir,
    prefix,
    pageUrl,
    repackCommand,
    replacementCount,
    fileCount: paths.length,
  };
}
