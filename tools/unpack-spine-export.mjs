#!/usr/bin/env node
/**
 * 解压 Cocos Inspector 导出的 Spine zip 到 Creator 工程目录。
 * 纹理文件名保持与 atlas 页一致（intro.webp / intro.jpg），便于 reimport。
 *
 * 用法:
 *   node tools/unpack-spine-export.mjs <zip路径> [目标目录]
 *   node tools/unpack-spine-export.mjs intro_intro_spine.zip D:/workspace/proj/assets/spine/intro
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const zipArg = process.argv[2];
const destArg = process.argv[3];

if (!zipArg) {
  console.error('用法: node tools/unpack-spine-export.mjs <zip> [destDir]');
  process.exit(1);
}

const zipPath = path.resolve(zipArg);
if (!fs.existsSync(zipPath)) {
  console.error(`找不到 zip: ${zipPath}`);
  process.exit(1);
}

const buf = fs.readFileSync(zipPath);
const zip = await JSZip.loadAsync(buf);

let manifest = null;
if (zip.file('manifest.json')) {
  try {
    manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  } catch {
    manifest = null;
  }
}

const skeletonDir = (() => {
  if (manifest?.skeletonDataName) {
    return String(manifest.skeletonDataName).replace(/[<>:"/\\|?*\s]+/g, '_');
  }
  const inner = Object.keys(zip.files).find(
    (n) => !n.startsWith('__') && n.includes('/') && /\.(json|atlas)$/i.test(n)
  );
  if (inner) return inner.split('/')[0];
  return path.basename(zipPath, path.extname(zipPath)).replace(/_spine$/i, '');
})();

const destDir = destArg
  ? path.resolve(destArg)
  : path.join(repoRoot, 'tmp', 'spine-export', skeletonDir);

fs.mkdirSync(destDir, { recursive: true });

const written = [];
const skip = new Set(['manifest.json', 'IMPORT_README.txt']);

for (const [rel, entry] of Object.entries(zip.files)) {
  if (entry.dir) continue;
  const base = path.basename(rel);
  if (skip.has(base) && !rel.includes('/')) continue;

  let outRel = rel.includes('/') ? rel.split('/').slice(1).join('/') : rel;
  if (outRel.startsWith(`${skeletonDir}/`)) {
    outRel = outRel.slice(skeletonDir.length + 1);
  }

  const outPath = path.join(destDir, outRel || base);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const data = await entry.async('nodebuffer');
  fs.writeFileSync(outPath, data);
  written.push({ rel, outPath, bytes: data.length });
}

if (manifest) {
  fs.writeFileSync(
    path.join(destDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

const readme = zip.file('IMPORT_README.txt');
if (readme) {
  fs.writeFileSync(
    path.join(destDir, 'IMPORT_README.txt'),
    await readme.async('string'),
    'utf8'
  );
}

const atlasPages = manifest?.atlasPages ?? [];
const textures = written.filter((w) => /\.(png|jpe?g|webp)$/i.test(w.outPath));

console.log(
  JSON.stringify(
    {
      ok: true,
      zipPath,
      destDir,
      skeletonDir,
      atlasPages,
      textureCount: textures.length,
      files: written.map((w) => path.relative(destDir, w.outPath)),
      nextStep:
        '在 Creator 资源管理器 refresh / reimport .json，确认 textureNames 页数与 atlas 一致',
    },
    null,
    2
  )
);
