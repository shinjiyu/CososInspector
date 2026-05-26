#!/usr/bin/env node
/**
 * 换皮流程：截图 → 列候选 →（人工/Agent 替换）→ 再截图复核 → 无待办再导出 → 可选重打包
 *
 * 环境: COCOS_PAGE_URL_MATCH, COCOS_BRIDGE_PORT
 * 选项:
 *   --repack          导出后自动 repack
 *   --skip-export     只截图复核，不导出
 *   --qa-pass         人工/Agent 已看图并确认达标后才允许导出（默认禁止导出）
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  closeBridgeClient,
  connectBridgeClientOnly,
  bridgeApiCall,
  waitForExtension,
} from './bridge-server.mjs';
import { writeReplacementPackToDisk } from './export-pack-lib.mjs';

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));
const OUT = resolve(repoRoot, 'tmp/mcp-trial');
const MATCH = process.env.COCOS_PAGE_URL_MATCH ?? 'applovin';
const args = process.argv.slice(2);
const doRepack = args.includes('--repack');
const skipExport = args.includes('--skip-export');

const UI_RE =
  /btn|logo|bg_|slot|spin|symbol|freecompress|mianze|start|collect|kembali/i;

function uiCandidates(sprites) {
  return sprites.filter((s) =>
    UI_RE.test(`${s.name} ${s.frameName} ${s.path}`)
  );
}

/**
 * 本轮必换目标（帧名不变，不能用 styled_ 前缀判断）
 * - freecompress：全屏外框/底图
 * - Node_bg1：中间游戏面板底（漏换会导致外框新、中间旧）
 * - btn_start：旋转按钮
 */
const PRIMARY_TARGETS = [
  { match: (s) => s.frameName === 'bg_slot' && /freecompress/i.test(s.name) },
  { match: (s) => s.name === 'Node_bg1' && /sw21_bg/i.test(s.frameName) },
  { match: (s) => /btn_start/i.test(s.name) && /btn_spin/i.test(s.frameName) },
];

function findPrimarySprites(sprites) {
  const found = [];
  for (const rule of PRIMARY_TARGETS) {
    const hit = sprites.find(rule.match);
    if (hit) found.push(hit);
  }
  return found;
}

/** 主目标节点是否都已在替换记录中 */
function pendingPrimaryTargets(sprites, recorded) {
  const recordedIds = new Set((recorded ?? []).map((r) => r.nodeId));
  return findPrimarySprites(sprites).filter((s) => !recordedIds.has(s.id));
}

async function capturePass(label) {
  mkdirSync(OUT, { recursive: true });
  const shot = await bridgeApiCall('captureGameScreenshot', [], {
    pageUrlMatch: MATCH,
  });
  if (!shot?.ok) throw new Error(`截屏失败: ${shot?.error ?? label}`);
  const path = join(OUT, `ui-ref-${label}.png`);
  writeFileSync(path, Buffer.from(shot.base64, 'base64'));
  return path;
}

await waitForExtension(60_000);
await connectBridgeClientOnly(17373);
mkdirSync(OUT, { recursive: true });

console.log('=== 换皮流程：导出前截图复核 ===\n');

const beforePath = await capturePass('before-export');
console.log('截图:', beforePath);

const sprites = await bridgeApiCall('listSprites', [], { pageUrlMatch: MATCH });
const recorded = await bridgeApiCall('listReplacements', [], { pageUrlMatch: MATCH });
const pending = pendingPrimaryTargets(sprites, recorded);

console.log('Sprite 总数:', sprites.length);
console.log('UI 候选:', uiCandidates(sprites).length);
console.log('已记录替换:', recorded?.length ?? 0);
console.log('主目标待换:', pending.length);

if (pending.length > 0) {
  console.log('\n主目标尚未记录替换:');
  for (const s of pending) {
    console.log(`  - ${s.id} | ${s.name} | ${s.frameName}`);
  }
  console.log(
    '\n未通过复核：请先完成替换（可用 prepare-sprite-replace.mjs 按原图留边），再运行本脚本。'
  );
  console.log('加 --force-export 可跳过节点检查（不推荐）');
  if (!args.includes('--force-export')) {
    closeBridgeClient();
    process.exit(2);
  }
}

console.log('\n--- 导出前视觉复核（必做）---');
console.log('打开截图检查：');
console.log('  1) 外框底图 + 中间面板 + 按钮 风格是否统一');
console.log('  2) 是否出现「外框新风格、中间仍原版麻将」穿帮');
console.log('  3) 按钮透明边、留边是否与原版一致');
console.log(`截图路径: ${beforePath}`);

if (!args.includes('--qa-pass')) {
  console.log(
    '\n⛔ 未加 --qa-pass：禁止导出/重打包。确认达标后执行:\n' +
      `  npm run cocos-style-flow -- --qa-pass${doRepack ? ' --repack' : ''}`
  );
  closeBridgeClient();
  process.exit(2);
}

if (skipExport) {
  console.log('\n--skip-export：仅复核，不导出。');
  closeBridgeClient();
  process.exit(0);
}

console.log('\n复核通过，开始导出替换包…');
const pack = await writeReplacementPackToDisk({
  pageUrlMatch: MATCH,
  outDir: args.includes('--out-dir')
    ? resolve(args[args.indexOf('--out-dir') + 1] ?? '')
    : undefined,
});

console.log('\n导出完成:');
console.log(JSON.stringify(pack, null, 2));

if (doRepack) {
  const html = resolve(repoRoot, 'tools/_probe/applovin2103.html');
  const packDir = pack.outDir;
  const outHtml = resolve(repoRoot, 'tmp/repacked_applovin2103.html');
  console.log('\n重打包…');
  await new Promise((res, rej) => {
    const child = spawn(
      process.execPath,
      [
        resolve(repoRoot, 'tools/repack-super-html.mjs'),
        '--html',
        html,
        '--pack',
        packDir,
        '--out',
        outHtml,
      ],
      { cwd: repoRoot, stdio: 'inherit' }
    );
    child.on('close', (code) => (code === 0 ? res() : rej(new Error(`repack exit ${code}`))));
  });
  const stat = existsSync(outHtml);
  console.log('重打包结果:', stat ? outHtml : '失败');
}

closeBridgeClient();
