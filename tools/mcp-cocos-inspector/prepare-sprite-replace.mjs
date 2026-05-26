#!/usr/bin/env node
/**
 * 按原图透明区域（留边）把风格图裁进与原图相同尺寸的画布。
 * 用法: node prepare-sprite-replace.mjs <原图.png> <风格图.png> [输出.png]
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';

const [originalPath, styledPath, outPathArg] = process.argv.slice(2);
if (!originalPath || !styledPath) {
  console.error(
    '用法: node prepare-sprite-replace.mjs <原图> <风格图> [输出.png]'
  );
  process.exit(1);
}

const CHROMA_TOL = 48;

function distMagenta(r, g, b) {
  return Math.abs(r - 255) + Math.abs(g - 0) + Math.abs(b - 255);
}

/** @returns {{ left: number; top: number; width: number; height: number } | null} */
function findOpaqueBounds(data, w, h, channels, alphaIndex = 3) {
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels === 4 ? data[i + 3] : 255;
      const isChroma = distMagenta(r, g, b) < CHROMA_TOL || (r > 200 && b > 200 && g < 100);
      const opaque = channels === 4 ? a > 12 && !isChroma : !isChroma && (r + g + b < 760);

      if (opaque) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function loadRaw(path) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

const orig = await loadRaw(originalPath);
const origBox = findOpaqueBounds(orig.data, orig.w, orig.h, orig.ch);
if (!origBox) {
  console.error('原图未找到不透明内容区域');
  process.exit(1);
}

let styledBuf = await sharp(styledPath).ensureAlpha().toBuffer();
let st = await loadRaw(styledBuf);

// 洋红底风格图：先去底
const cleaned = Buffer.alloc(st.w * st.h * 4);
for (let p = 0, i = 0; p < st.w * st.h; p++, i += st.ch) {
  const r = st.data[i],
    g = st.data[i + 1],
    b = st.data[i + 2];
  const o = p * 4;
  cleaned[o] = r;
  cleaned[o + 1] = g;
  cleaned[o + 2] = b;
  const chroma = distMagenta(r, g, b) < CHROMA_TOL;
  cleaned[o + 3] = chroma ? 0 : st.ch === 4 ? st.data[i + 3] : 255;
}
styledBuf = await sharp(cleaned, {
  raw: { width: st.w, height: st.h, channels: 4 },
})
  .png()
  .toBuffer();
st = await loadRaw(styledBuf);

const styleBox = findOpaqueBounds(st.data, st.w, st.h, st.ch);
if (!styleBox) {
  console.error('风格图去底后无内容');
  process.exit(1);
}

const fitted = await sharp(styledBuf)
  .extract({
    left: styleBox.left,
    top: styleBox.top,
    width: styleBox.width,
    height: styleBox.height,
  })
  .resize(origBox.width, origBox.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const canvas = await sharp({
  create: {
    width: orig.w,
    height: orig.h,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: fitted, left: origBox.left, top: origBox.top }])
  .png()
  .toBuffer();

const outPath = outPathArg ?? styledPath.replace(/(\.\w+)?$/, '_fitted.png');
writeFileSync(outPath, canvas);

const meta = await sharp(outPath).metadata();
console.log(
  JSON.stringify(
    {
      ok: true,
      outPath,
      canvas: { w: meta.width, h: meta.height, hasAlpha: meta.hasAlpha },
      originalContentBox: origBox,
      styledContentBox: styleBox,
    },
    null,
    2
  )
);
