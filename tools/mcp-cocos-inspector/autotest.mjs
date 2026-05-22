#!/usr/bin/env node
/**
 * 桥接 + 试玩页 自动化冒烟（需：npm run cocos-bridge + Chrome 试玩页 MCP 已连接）
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  bridgeApiCall,
  closeBridgeClient,
  connectBridgeClientOnly,
  waitForExtension,
} from './bridge-server.mjs';
import { writeReplacementPackToDisk } from './export-pack-lib.mjs';

const MATCH = process.env.COCOS_PAGE_URL_MATCH ?? 'applovin';
const failures = [];

function ok(name, detail = '') {
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  ✗ ${name} — ${msg}`);
  failures.push(`${name}: ${msg}`);
}

async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    fail(name, e);
  }
}

console.log('[cocos-autotest] 等待扩展连接桥接…');
try {
  await waitForExtension(60_000);
  ok('扩展已连接');
} catch (e) {
  fail('扩展已连接', e);
  console.error('\n[cocos-autotest] FAIL — 请先 npm run cocos-bridge，Chrome 打开试玩页并 F5');
  closeBridgeClient();
  process.exit(1);
}

await connectBridgeClientOnly();

await step('getPageInfo', async () => {
  const info = await bridgeApiCall('getPageInfo', [], { pageUrlMatch: MATCH });
  if (!info?.hasCocos) throw new Error('页面无 Cocos');
  ok('getPageInfo', info.sceneName ?? info.engineVersion ?? '');
});

await step('listSprites', async () => {
  const sprites = await bridgeApiCall('listSprites', [], { pageUrlMatch: MATCH });
  if (!Array.isArray(sprites) || sprites.length < 1) {
    throw new Error(`sprites=${sprites?.length ?? 0}`);
  }
  ok('listSprites', `${sprites.length} 个`);
});

await step('captureGameScreenshot', async () => {
  const shot = await bridgeApiCall('captureGameScreenshot', [], {
    pageUrlMatch: MATCH,
  });
  if (!shot?.ok || !shot.base64) throw new Error('截屏失败');
  ok('captureGameScreenshot', `${shot.width}×${shot.height}`);
});

await step('listReplacements', async () => {
  const list = await bridgeApiCall('listReplacements', [], { pageUrlMatch: MATCH });
  if (!Array.isArray(list)) throw new Error('非数组');
  ok('listReplacements', `${list.length} 条`);
});

await step('exportReplacementPack（分片）', async () => {
  const list = await bridgeApiCall('listReplacements', [], { pageUrlMatch: MATCH });
  if (!list.length) {
    ok('exportReplacementPack（分片）', '跳过（无替换记录）');
    return;
  }
  const pack = await writeReplacementPackToDisk({
    pageUrlMatch: MATCH,
    waitMs: 5_000,
  });
  const manifestPath = join(pack.outDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error('manifest.json 缺失');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.replacements?.length !== pack.replacementCount) {
    throw new Error(
      `manifest 条数 ${manifest.replacements?.length} !== ${pack.replacementCount}`
    );
  }
  ok('exportReplacementPack（分片）', pack.outDir);
});

console.log('');
if (failures.length) {
  console.error(`[cocos-autotest] FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  closeBridgeClient();
  process.exit(1);
}
console.log('[cocos-autotest] PASS');
closeBridgeClient();
