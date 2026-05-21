#!/usr/bin/env node
/**
 * 在已下载的试玩页源码目录中，按 manifest.json 应用替换图。
 *
 * 用法:
 *   node tools/apply-replacements.mjs --source ./downloaded-site --pack ./cocos-replacements_xxx
 *
 * --source  整站下载根目录（会递归搜索可匹配的文件）
 * --pack    导出包目录（含 manifest.json 与 images/）
 * --dry-run 只打印将修改的文件，不写入
 */

import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';

function parseArgs(argv) {
  const args = { source: '', pack: '', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') args.source = argv[++i] ?? '';
    else if (a === '--pack') args.pack = argv[++i] ?? '';
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '-h' || a === '--help') {
      console.log(`用法: node tools/apply-replacements.mjs --source <dir> --pack <dir> [--dry-run]`);
      process.exit(0);
    }
  }
  return args;
}

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walkFiles(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

function normalizeKey(s) {
  return decodeURIComponent(String(s)).toLowerCase();
}

function fileMatchesKey(filePath, key) {
  const base = basename(filePath);
  const nk = normalizeKey(key);
  if (normalizeKey(base) === nk) return true;
  if (normalizeKey(base).includes(nk) && nk.length >= 6) return true;
  if (nk.length >= 8) {
    try {
      const content = readFileSync(filePath, 'utf8');
      if (content.includes(key)) return true;
    } catch {
      /* binary */
    }
  }
  return false;
}

function isImagePath(p) {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

function main() {
  const { source, pack, dryRun } = parseArgs(process.argv);
  if (!source || !pack) {
    console.error('缺少 --source 或 --pack');
    process.exit(1);
  }

  const sourceDir = resolve(source);
  const packDir = resolve(pack);
  const manifestPath = join(packDir, 'manifest.json');

  if (!existsSync(manifestPath)) {
    console.error(`未找到 manifest: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const replacements = manifest.replacements ?? [];
  if (!replacements.length) {
    console.error('manifest 中没有 replacements');
    process.exit(1);
  }

  const allFiles = walkFiles(sourceDir);
  const imageFiles = allFiles.filter(isImagePath);
  const textFiles = allFiles.filter((f) => /\.(json|js|html|plist|atlas|txt|xml)$/i.test(f));

  let applied = 0;

  for (const rep of replacements) {
    const imagePath = join(packDir, rep.imageFile ?? `images/${rep.replacement?.exportFileName}`);
    if (!existsSync(imagePath)) {
      console.warn(`跳过（缺少替换图）: ${imagePath}`);
      continue;
    }

    const keys = [
      ...(rep.matchKeys ?? []),
      rep.original?.frameName,
      rep.original?.textureName,
      rep.original?.textureUuid,
      ...(rep.original?.assetUrls ?? []).map((u) => basename(String(u).split('?')[0])),
    ].filter(Boolean);

    const targets = new Set();

    for (const key of keys) {
      if (!key || String(key).length < 2) continue;
      for (const f of imageFiles) {
        if (fileMatchesKey(f, key)) targets.add(f);
      }
      for (const f of textFiles) {
        try {
          if (readFileSync(f, 'utf8').includes(key)) {
            const dir = dirname(f);
            for (const img of imageFiles) {
              if (dirname(img) === dir || dirname(img).startsWith(dir)) {
                if (fileMatchesKey(img, key) || basename(img).includes(basename(key))) {
                  targets.add(img);
                }
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (targets.size === 0) {
      console.warn(`未匹配到文件: ${rep.nodePath} (${rep.original?.frameName})`);
      continue;
    }

    for (const target of targets) {
      const backup = `${target}.bak-cocos-inspector`;
      console.log(`${dryRun ? '[dry-run] ' : ''}替换 ${target} ← ${basename(imagePath)}`);
      if (!dryRun) {
        if (!existsSync(backup)) copyFileSync(target, backup);
        copyFileSync(imagePath, target);
      }
      applied++;
    }
  }

  const logPath = join(packDir, 'apply-log.txt');
  const summary = `applied=${applied} dryRun=${dryRun} source=${sourceDir}\n`;
  if (!dryRun) writeFileSync(logPath, summary + new Date().toISOString() + '\n');

  console.log(`\n完成。${dryRun ? '（预览模式）' : ''} 写入/覆盖 ${applied} 个目标文件。`);
  if (applied === 0) {
    console.log('提示: 确认 --source 为整站下载根目录，且 matchKeys 与资源文件名一致。');
  }
}

main();
