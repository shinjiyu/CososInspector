#!/usr/bin/env node
/**
 * 对 tmp/mcp-share/out 下最新替换包执行 super-html 重打包（调试/补跑用）
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getShareDir } from './shared-fs.mjs';
import { projectPackDir } from './repack-hints.mjs';
import { runRepackForPack } from './repack-run.mjs';

const outRoot = join(getShareDir(), 'out');
const html =
  process.argv.find((a, i) => process.argv[i - 1] === '--html') ?? undefined;

function latestPackDir() {
  if (!existsSync(outRoot)) {
    throw new Error(`无替换包目录: ${outRoot}（请先导出）`);
  }
  const dirs = readdirSync(outRoot)
    .filter((n) => n.startsWith('cocos-replacements_'))
    .map((n) => join(outRoot, n))
    .filter((p) => statSync(p).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!dirs.length) throw new Error(`未找到 cocos-replacements_* : ${outRoot}`);
  return dirs[0];
}

const packDirAbs = latestPackDir();
const prefix = packDirAbs.split(/[/\\]/).pop();
const packDirRel = projectPackDir(prefix);

const r = runRepackForPack({
  packDirAbs,
  packDirRel,
  pageUrl: 'https://local/repack-latest',
  htmlPath: html,
});

if (!r.ok) {
  console.error(r.error);
  process.exit(1);
}
console.log(
  JSON.stringify(
    { packDirAbs, repackedHtml: r.repackedHtmlRel, preview: r.previewHint },
    null,
    2
  )
);
