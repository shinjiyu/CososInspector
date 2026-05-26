#!/usr/bin/env node
/**
 * super-html 试玩页：用替换包重打包 window.__zip 内的 __res 纹理。
 *
 * 用法:
 *   node tools/repack-super-html.mjs --html tools/_probe/applovin2103.html --pack tmp
 *   node tools/repack-super-html.mjs --html original.html --manifest tmp/xxx_manifest.json --out out.html
 *
 * --pack    目录：含 manifest.json + images/，或浏览器扁平下载的 *_manifest.json / *_images_*
 * --dry-run 只打印将修改的 __res 键
 *
 * 图集子帧：manifest 含 frameRect 时合成进 native PNG，不覆盖整张图集。
 * zip 内联：部分 native（如 c1845490….jpg）仅在 zip 条目内为 data URL，不在 __res。
 * 所有写入的 data URL 会在第 27 字符插入 oasj 占位符（与 super-html getRes 一致）。
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { createRequire } from 'module';
import {
  applySuperHtmlOasjPlaceholder,
  patchAtlasInRes,
} from './repack-atlas-patch.mjs';
import { patchZipInlineImages } from './repack-zip-inline.mjs';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

function parseArgs(argv) {
  const args = {
    html: '',
    pack: '',
    manifest: '',
    out: '',
    dryRun: false,
    keepImportMap: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--html') args.html = argv[++i] ?? '';
    else if (a === '--pack') args.pack = argv[++i] ?? '';
    else if (a === '--manifest') args.manifest = argv[++i] ?? '';
    else if (a === '--out') args.out = argv[++i] ?? '';
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--keep-import-map') args.keepImportMap = true;
    else if (a === '-h' || a === '--help') {
      console.log(`用法: node tools/repack-super-html.mjs --html <试玩.html> --pack <替换包目录> [--out out.html] [--dry-run]`);
      process.exit(0);
    }
  }
  return args;
}

function assetUrlToZipPath(url, pageUrl) {
  try {
    const u = new URL(url, pageUrl);
    const idx = u.pathname.indexOf('/assets/');
    if (idx >= 0) return u.pathname.slice(idx + 1);
    const idx2 = u.pathname.indexOf('assets/');
    if (idx2 >= 0) return u.pathname.slice(idx2);
  } catch {
    if (url.includes('assets/')) {
      const i = url.indexOf('assets/');
      return url.slice(i).split('?')[0];
    }
  }
  return null;
}

function uuidStem(uuid) {
  return String(uuid || '').split('@')[0]?.trim() ?? '';
}

/** 解析 pack 目录（支持扁平下载命名） */
function loadManifestAndImages(packDir) {
  const dir = resolve(packDir);
  const entries = readdirSync(dir);

  let manifestPath = '';
  if (existsSync(join(dir, 'manifest.json'))) {
    manifestPath = join(dir, 'manifest.json');
  } else {
    const flat = entries.find((n) => n.includes('manifest') && n.endsWith('.json'));
    if (!flat) throw new Error(`在 ${dir} 未找到 manifest.json`);
    manifestPath = join(dir, flat);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const rep of manifest.replacements ?? []) {
    const exportName =
      rep.replacement?.exportFileName ??
      basename(rep.imageFile || '');
    const nested = join(dir, 'images', exportName);
    if (existsSync(nested)) {
      rep._imagePath = nested;
      continue;
    }
    const flatName = entries.find(
      (n) =>
        n === exportName ||
        n.endsWith(`_${exportName}`) ||
        n.includes(`_images_${exportName}`)
    );
    if (flatName) {
      rep._imagePath = join(dir, flatName);
      continue;
    }
    throw new Error(`找不到替换图: ${exportName}（pack: ${dir}）`);
  }

  return manifest;
}

function findResImageKeys(resMap, rep, pageUrl) {
  const keys = Object.keys(resMap);
  const targets = new Set();
  const stem = uuidStem(rep.original?.textureUuid);

  for (const k of keys) {
    if (!/^data:image\//i.test(resMap[k] || '')) continue;
    if (!/\.(png|jpe?g|webp|gif)$/i.test(k)) continue;

    if (stem && k.includes(stem)) targets.add(k);

    for (const url of rep.original?.assetUrls ?? []) {
      const zp = assetUrlToZipPath(url, pageUrl);
      if (zp && (k === zp || k.endsWith(zp))) targets.add(k);
    }

    for (const key of rep.matchKeys ?? []) {
      if (key.length >= 8 && k.includes(key)) targets.add(k);
    }
  }

  return [...targets];
}

function dataUrlLength(mime, buf) {
  return `data:${mime};base64,`.length + buf.toString('base64').length;
}

/** super-html 约定：about: 从 __res 加载，便于 localhost 单文件预览（无需磁盘 cocos-js/） */
function patchImportMapForLocalPreview(html) {
  const aboutMap = JSON.stringify({
    imports: {
      cc: 'about:cocos-js/cc.js',
      './../cocos-js/cc.js': 'about:cocos-js/cc.js',
      'cocos-js/cc.js': 'about:cocos-js/cc.js',
    },
  });
  if (html.includes('systemjs-importmap')) {
    return html.replace(
      /<script type="systemjs-importmap">[^<]*<\/script>/,
      `<script type="systemjs-importmap">${aboutMap}</script>`
    );
  }
  return html.replace(
    '</head>',
    `<script type="systemjs-importmap">${aboutMap}</script>\n</head>`
  );
}

/** 浏览器对超长 data: URL 会 net::ERR_INVALID_URL；原版 __res 长度即安全上限 */
async function encodeForResKey(imagePath, resKey, originalValue, rep) {
  const input = readFileSync(imagePath);
  const wantJpeg = /\.jpe?g$/i.test(resKey);
  const origJpeg = String(originalValue || '').startsWith('data:image/jpeg');
  const maxLen =
    typeof originalValue === 'string' && originalValue.length > 0
      ? originalValue.length
      : 0;

  let outBuf = input;
  let mime = wantJpeg || origJpeg ? 'image/jpeg' : 'image/png';

  if (wantJpeg || origJpeg) {
    try {
      const sharp = (await import('sharp')).default;
      const ds = rep?.original?.displaySize;
      let w = ds?.width;
      let h = ds?.height;
      if (!w || !h) {
        const meta = await sharp(input).metadata();
        w = meta.width;
        h = meta.height;
      }

      let quality = 88;
      let scale = 1;

      const render = async () => {
        const rw = Math.max(1, Math.round((w || 1280) * scale));
        const rh = Math.max(1, Math.round((h || 720) * scale));
        return sharp(input)
          .resize(rw, rh, { fit: 'fill' })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      };

      outBuf = await render();
      mime = 'image/jpeg';

      if (maxLen > 0) {
        while (
          dataUrlLength(mime, outBuf) + 1 > maxLen &&
          (quality > 25 || scale > 0.55)
        ) {
          if (quality > 25) quality -= 5;
          else scale -= 0.05;
          outBuf = await render();
        }
        const withPad = dataUrlLength(mime, outBuf) + 1;
        if (withPad > maxLen) {
          throw new Error(
            `${basename(imagePath)} 压缩后 data URL 仍 ${withPad} 字符，超过原版 ${maxLen}（请换更小图片）`
          );
        }
        console.log(
          `  压缩: ${w}x${h} scale=${scale.toFixed(2)} q=${quality} → ${withPad}/${maxLen} chars (+oasj占位)`
        );
      } else {
        outBuf = await sharp(input).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      }
    } catch (e) {
      if (maxLen > 0) throw e;
      console.warn(
        `[warn] sharp 失败，${basename(imagePath)} → ${resKey} 按 PNG 内联: ${e.message}`
      );
      mime = 'image/png';
    }
  } else if (/\.webp$/i.test(resKey)) {
    mime = 'image/webp';
  } else if (/\.png$/i.test(resKey) || mime === 'image/png') {
    try {
      const sharp = (await import('sharp')).default;
      const ds = rep?.original?.displaySize;
      let w = ds?.width;
      let h = ds?.height;
      if (!w || !h) {
        const m = await sharp(input).metadata();
        w = m.width;
        h = m.height;
      }
      let quality = 90;
      const render = async () =>
        sharp(input)
          .resize(Math.max(1, w || 1), Math.max(1, h || 1), { fit: 'fill' })
          .png({ compressionLevel: 6 })
          .toBuffer();
      outBuf = await render();
      mime = 'image/png';
      if (maxLen > 0) {
        while (
          dataUrlLength(mime, outBuf) + 1 > maxLen &&
          (quality > 50 || w > 32)
        ) {
          if (quality > 50) quality -= 10;
          else {
            w = Math.max(1, Math.round((w || 1) * 0.9));
            h = Math.max(1, Math.round((h || 1) * 0.9));
          }
          outBuf = await render();
        }
      }
    } catch (e) {
      console.warn(`[warn] PNG 缩放失败: ${e.message}`);
    }
  }

  let dataUrl = applySuperHtmlOasjPlaceholder(
    `data:${mime};base64,${outBuf.toString('base64')}`
  );

  if (maxLen > 0 && dataUrl.length > maxLen) {
    throw new Error(
      `data URL 长度 ${dataUrl.length} 超过原版 ${maxLen}（${basename(imagePath)} → ${resKey}）`
    );
  }
  return dataUrl;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.html) {
    console.error('缺少 --html');
    process.exit(1);
  }

  const htmlPath = resolve(args.html);
  const html = readFileSync(htmlPath, 'utf8');
  const zipMatch = html.match(/window\.__zip\s*=\s*"([^"]+)"/);
  if (!zipMatch) {
    console.error('HTML 中未找到 window.__zip');
    process.exit(1);
  }

  let manifest;
  if (args.manifest) {
    const m = JSON.parse(readFileSync(resolve(args.manifest), 'utf8'));
    const packDir = dirname(resolve(args.manifest));
    for (const rep of m.replacements ?? []) {
      const exportName = rep.replacement?.exportFileName ?? basename(rep.imageFile);
      const p = join(packDir, 'images', exportName);
      if (!existsSync(p)) throw new Error(`找不到 ${p}`);
      rep._imagePath = p;
    }
    manifest = m;
  } else if (args.pack) {
    manifest = loadManifestAndImages(args.pack);
  } else {
    console.error('缺少 --pack 或 --manifest');
    process.exit(1);
  }

  const pageUrl = manifest.pageUrl || 'https://example.com/';
  const zip = await JSZip.loadAsync(zipMatch[1], { base64: true });
  const resFile = zip.file('__res');
  if (!resFile) {
    console.error('__zip 内无 __res');
    process.exit(1);
  }

  const resMap = JSON.parse(await resFile.async('string'));
  let applied = 0;
  const log = [];

  for (const rep of manifest.replacements ?? []) {
    rep.pageUrl = pageUrl;

    /** 采集到的 assetUrls 若指向 __res 内独立 .jpg，优先整图覆盖（避免误匹配其它大图集 PNG） */
    const wholeJpegKeys = findResImageKeys(resMap, rep, pageUrl).filter((k) =>
      /\.jpe?g$/i.test(k)
    );
    if (wholeJpegKeys.length > 0) {
      for (const key of wholeJpegKeys) {
        const dataUrl = await encodeForResKey(
          rep._imagePath,
          key,
          resMap[key],
          rep
        );
        log.push(
          `[整图·JPG] ${key} ← ${basename(rep._imagePath)} (${dataUrl.length} chars)`
        );
        if (!args.dryRun) {
          resMap[key] = dataUrl;
          applied++;
        }
      }
      continue;
    }

    let atlas = await patchAtlasInRes(
      resMap,
      rep,
      rep._imagePath,
      assetUrlToZipPath
    );

    if (!atlas.ok && atlas.reason === 'too-large') {
      console.warn(
        `图集过大，改走整图匹配: ${rep.nodePath} (${rep.original?.frameName})`
      );
      atlas = { ok: false, reason: 'no-atlas' };
    }

    if (atlas.ok) {
      const fr = atlas.frame ?? rep.original?.frameRect;
      log.push(
        `[图集] ${atlas.key} ← ${basename(rep._imagePath)} ` +
          `(帧 ${fr?.x},${fr?.y} ${fr?.width}×${fr?.height}` +
          `${atlas.rotated ? ' 旋转' : ''}, 图集 ${atlas.atlasSize.w}×${atlas.atlasSize.h}, ${atlas.dataUrl.length} chars)`
      );
      if (!args.dryRun) {
        resMap[atlas.key] = atlas.dataUrl;
        applied++;
      }
      continue;
    }

    if (atlas.key && atlas.reason === 'not-atlas') {
      const fr = atlas.frameRect;
      const dataUrl = await encodeForResKey(
        rep._imagePath,
        atlas.key,
        resMap[atlas.key],
        rep
      );
      log.push(
        `[整图·图集纹理] ${atlas.key} ← ${basename(rep._imagePath)} ` +
          `(${fr?.width}×${fr?.height}, ${dataUrl.length} chars)`
      );
      if (!args.dryRun) {
        resMap[atlas.key] = dataUrl;
        applied++;
      }
      continue;
    }

    const targets = findResImageKeys(resMap, rep, pageUrl);

    const zipInline = await patchZipInlineImages(
      zip,
      rep,
      rep._imagePath,
      encodeForResKey,
      { pageUrl, dryRun: args.dryRun, assetUrlToZipPath }
    );
    if (zipInline.length > 0) {
      for (const r of zipInline) {
        log.push(
          `[zip内联] ${r.path} ← ${basename(rep._imagePath)} ` +
            `(${r.dataUrl.length}/${r.originalLen} chars)`
        );
        if (!args.dryRun) applied++;
      }
      continue;
    }

    if (targets.length === 0) {
      console.warn(
        `未匹配 __res / zip 内联纹理: ${rep.nodePath} (${rep.original?.frameName})` +
          (atlas.reason ? ` [图集:${atlas.reason}]` : '')
      );
      continue;
    }

    for (const key of targets) {
      const dataUrl = await encodeForResKey(
        rep._imagePath,
        key,
        resMap[key],
        rep
      );
      log.push(`[整图] ${key} ← ${basename(rep._imagePath)} (${dataUrl.length} chars)`);
      if (!args.dryRun) {
        resMap[key] = dataUrl;
        applied++;
      }
    }
  }

  console.log('--- patch log ---');
  for (const line of log) console.log(line);
  console.log(`applied: ${applied}${args.dryRun ? ' (dry-run)' : ''}`);

  if (args.dryRun || applied === 0) {
    process.exit(applied === 0 && !args.dryRun ? 1 : 0);
  }

  zip.file('__res', JSON.stringify(resMap));
  const newZipB64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const outPath =
    resolve(args.out) ||
    join(
      resolve(args.pack || '.'),
      `repacked_${basename(htmlPath).replace(/\.html?$/i, '')}.html`
    );

  let outHtml = html.replace(
    /window\.__zip\s*=\s*"[^"]+"/,
    `window.__zip = "${newZipB64}"`
  );
  if (!args.keepImportMap) {
    outHtml = patchImportMapForLocalPreview(outHtml);
    console.log('已改写 import map → about:cocos-js/cc.js（本地预览）');
  }
  writeFileSync(outPath, outHtml, 'utf8');
  console.log(`\n已写入: ${outPath}`);
  console.log(`大小: ${(outHtml.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
