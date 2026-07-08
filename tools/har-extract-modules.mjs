#!/usr/bin/env node
/**
 * 从 HAR 中提取 Cocos Creator SystemJS bundle，按原始 TS 模块名拆分还原
 * 用法: node tools/har-extract-modules.mjs <har文件> [输出目录]
 *
 * 原理：生产包用 SystemJS 打包，每个源文件对应一段
 *   System.register("chunks:///_virtual/<Name>.ts", [deps...], (function(){...}))
 * 模块名即原始工程里的文件名，据此可重建工程骨架（编译后 JS，非原始 TS）。
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const harPath = process.argv[2];
const outDir = process.argv[3] ?? './tools/har-extract-modules/godeebxp';

if (!harPath) {
  console.error('用法: node tools/har-extract-modules.mjs <har文件> [输出目录]');
  process.exit(1);
}

console.log(`[HAR还原] 读取 ${harPath} ...`);
const har = JSON.parse(readFileSync(harPath, 'utf8'));
const entries = har.log?.entries ?? [];
console.log(`[HAR还原] 共 ${entries.length} 个请求`);

// 收集所有 JS 响应体
const bodies = [];
for (const e of entries) {
  const url = e.request?.url ?? '';
  const text = e.response?.content?.text;
  if (!text) continue;
  if (text.includes('System.register(') || /\.js(\?|$)/.test(url)) {
    bodies.push({ url, text });
  }
}
console.log(`[HAR还原] 命中 ${bodies.length} 个可能含代码的响应`);

// 用正则切分每个 System.register 模块
// 匹配起始位置，再用括号配平找到模块结尾
const registerRe = /System\.register\(\s*(["'])(.*?)\1/g;

let total = 0;
const manifest = [];

const sliceBalanced = (src, startIdx) => {
  // 从 System.register( 的 '(' 开始，做括号/字符串配平
  let i = src.indexOf('(', startIdx);
  if (i < 0) return null;
  const open = i;
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
};

for (const { url, text } of bodies) {
  let m;
  registerRe.lastIndex = 0;
  while ((m = registerRe.exec(text))) {
    const modName = m[2];
    if (!modName.startsWith('chunks:///')) continue;
    const body = sliceBalanced(text, m.index);
    if (!body) continue;
    // chunks:///_virtual/MainController.ts -> MainController.ts
    const rel = modName.replace(/^chunks:\/\/\//, '').replace(/^_virtual\//, '');
    const safeRel = rel.replace(/[<>:"|?*]/g, '_');
    const outPath = join(outDir, 'src', safeRel.endsWith('.ts') ? safeRel + '.js' : safeRel + '.js');
    mkdirSync(dirname(outPath), { recursive: true });
    const header = `// 源模块: ${modName}\n// 来自 HAR: ${url}\n// 注意：这是编译后 JS（非原始 TS），变量名可能被压缩\n\n`;
    writeFileSync(outPath, header + 'System.register' + body.replace(/^\(/, '(') + ';\n', 'utf8');
    manifest.push({ module: modName, file: outPath, bytes: body.length });
    total++;
  }
}

manifest.sort((a, b) => a.module.localeCompare(b.module));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`[HAR还原] 完成，导出 ${total} 个模块到 ${join(outDir, 'src')}`);
console.log(`[HAR还原] 清单: ${join(outDir, 'manifest.json')}`);
