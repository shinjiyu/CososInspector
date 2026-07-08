#!/usr/bin/env node
/**
 * 在 HAR 提取的 JS 目录中搜索 Cocos 自定义组件类名
 * 用法: node tools/search-cocos-class.mjs MainController ./path/to/extracted
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const className = process.argv[2];
const root = process.argv[3] ?? './tools/fastspin-extractor/extracted';

if (!className) {
  console.error('用法: node tools/search-cocos-class.mjs <ClassName> [searchDir]');
  process.exit(1);
}

const patterns = [
  new RegExp(`ccclass\\(['"\`]${className}['"\`]`),
  new RegExp(`class\\s+${className}\\b`),
  new RegExp(`['"\`]${className}['"\`]`),
];

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (['.js', '.json', '.map'].includes(extname(p))) out.push(p);
  }
  return out;
};

const files = walk(root);
const hits = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!text.includes(className)) continue;
  const matched = patterns.some((re) => re.test(text));
  hits.push({ file, matched });
}

if (hits.length === 0) {
  console.log(`未在 ${root} 中找到 ${className}`);
  process.exit(0);
}

console.log(`找到 ${hits.length} 个文件包含 "${className}":\n`);
for (const h of hits) {
  console.log(`${h.matched ? '[class]' : '[text]'} ${h.file}`);
}
