#!/usr/bin/env node
/**
 * 替换单张纹理（共享目录模式，WebSocket 不传 base64）
 * 用法: node replace-one.mjs <nodeId> <本地png路径>
 */
import {
  connectBridgeClientOnly,
  bridgeApiCall,
  waitForExtension,
  closeBridgeClient,
} from './bridge-server.mjs';
import { startShareHttp } from './share-http.mjs';
import {
  stageInputFile,
  shareFileUrl,
  getShareHttpPort,
} from './shared-fs.mjs';

const [nodeId, pngPath] = process.argv.slice(2);
if (!nodeId || !pngPath) {
  console.error('用法: node replace-one.mjs <nodeId> <png路径>');
  process.exit(1);
}

try {
  await startShareHttp(getShareHttpPort());
} catch (e) {
  if (e?.code !== 'EADDRINUSE') throw e;
}

const rel = stageInputFile(pngPath);
await waitForExtension(60_000);
await connectBridgeClientOnly(17373);
const res = await bridgeApiCall(
  'replaceTextureFromShare',
  [
    nodeId,
    rel,
    {
      mime: 'image/png',
      filename: pngPath.split(/[/\\]/).pop(),
      shareBaseUrl: `http://127.0.0.1:${getShareHttpPort()}`,
    },
  ],
  { pageUrlMatch: process.env.COCOS_PAGE_URL_MATCH ?? 'applovin' }
);
console.log(JSON.stringify({ ...res, shareUrl: shareFileUrl(rel) }, null, 2));
closeBridgeClient();
process.exit(res?.ok === false ? 1 : 0);
