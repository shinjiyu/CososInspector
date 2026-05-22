#!/usr/bin/env node
/** 一次跑通：列 Sprite → 截屏 → 下载 → 替换 → 导出 */
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  closeBridgeClient,
  connectBridgeClientOnly,
  bridgeApiCall,
} from './bridge-server.mjs';

const OUT = resolve('tmp/mcp-trial');
const MATCH = process.env.COCOS_PAGE_URL_MATCH ?? 'applovin';

await connectBridgeClientOnly(17373);
mkdirSync(OUT, { recursive: true });

const sprites = await bridgeApiCall('listSprites', [], { pageUrlMatch: MATCH });
console.log('sprites:', sprites.length);

const ui = sprites.filter((s) =>
  /btn|logo|bg_|slot|spin|symbol|freecompress|mianze|start/i.test(
    `${s.name} ${s.frameName} ${s.path}`
  )
);
console.log('ui candidates:', ui.length);
console.log(ui.slice(0, 12).map((s) => `${s.name} | ${s.frameName} | ${s.id}`).join('\n'));

const shot = await bridgeApiCall('captureGameScreenshot', [], {
  pageUrlMatch: MATCH,
});
if (shot?.ok) {
  writeFileSync(join(OUT, 'ui-ref.png'), Buffer.from(shot.base64, 'base64'));
  console.log('screenshot ok', shot.width, shot.height);
}

const targets = [
  ui.find((s) => s.frameName === 'bg_slot' || s.name === 'freecompress'),
  ui.find((s) => /btn_start|btn_spin|spin/i.test(s.frameName + s.name)),
  ui.find((s) => /symbol_3|symbol/i.test(s.frameName) && s.frameName.includes('symbol')),
].filter(Boolean);

const unique = [...new Map(targets.map((t) => [t.id, t])).values()];

for (const t of unique.slice(0, 2)) {
  const dl = await bridgeApiCall('downloadTexture', [t.id], { pageUrlMatch: MATCH });
  if (!dl?.ok) {
    console.log('download fail', t.frameName, dl);
    continue;
  }
  const p = join(OUT, dl.filename);
  writeFileSync(p, Buffer.from(dl.base64, 'base64'));
  console.log('downloaded', p, dl.width, dl.height, t.frameName);
}

console.log('done — 替换请用 Cursor GenerateImage 出图后:');
console.log('  node tools/mcp-cocos-inspector/replace-one.mjs <nodeId> <png>');
closeBridgeClient();
