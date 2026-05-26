import {
  bridgeApiCall,
  connectBridgeClientOnly,
  waitForExtension,
  closeBridgeClient,
} from './bridge-server.mjs';
import { exportPackViaBridge } from './export-pack-server.mjs';
import { isShareHttpRunning } from './share-http.mjs';

/**
 * 导出替换包：优先走本地 HTTP 服务（同进程直接写盘）；否则经 WS 客户端调桥接。
 * @param {{ pageUrlMatch?: string; outDir?: string; waitMs?: number }} opts
 */
export async function writeReplacementPackToDisk(opts = {}) {
  const match = opts.pageUrlMatch ?? process.env.COCOS_PAGE_URL_MATCH ?? 'applovin';
  const waitMs = opts.waitMs ?? 60_000;

  await waitForExtension(waitMs);

  let result;
  if (isShareHttpRunning()) {
    result = await exportPackViaBridge({ pageUrlMatch: match });
  } else {
    await connectBridgeClientOnly();
    try {
      result = await exportPackViaBridge({ pageUrlMatch: match });
    } finally {
      closeBridgeClient();
    }
  }

  if (!result?.ok) {
    throw new Error(result?.error ?? 'exportPackViaBridge 失败');
  }

  const d = result.data;
  return {
    outDir: d.packDirAbs,
    shareDir: d.shareDir,
    packRoot: d.packRoot,
    prefix: d.prefix,
    packDir: d.packDir,
    pageUrl: d.pageUrl,
    repackCommand: d.repackCommand,
    replacementCount: d.replacementCount,
    fileCount: d.fileCount,
    nextStep: d.nextStep,
    mode: 'local-server',
  };
}
