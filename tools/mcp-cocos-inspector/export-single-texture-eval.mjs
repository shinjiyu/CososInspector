#!/usr/bin/env node
/**
 * 用 evalPage 在试玩页单独导出一张 Sprite 纹理（originalCanvas）
 *
 * 用法:
 *   node export-single-texture-eval.mjs --frame symbol_04
 *   node export-single-texture-eval.mjs --frame symbol_04 --out D:/workspace/testAutoCopy/assets/recovered/godeebxp/test/symbol_04_eval.png
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  callBridgeAtPort,
  connectBridgeClientOnly,
  waitForExtension,
} from './bridge-server.mjs';

const measureOpaqueSharp = async (buf) => {
  const { data, info } = await sharp(buf).raw().ensureAlpha().toBuffer({
    resolveWithObject: true,
  });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return null;
  return {
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    x: minX,
    y: minY,
    png: { w: info.width, h: info.height },
  };
};

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    frameName: get('--frame', 'symbol_04'),
    wsPort: Number(get('--ws-port', '17373')),
    pageUrlMatch: get('--page-url-match', 'godeebxp'),
    project: get('--project', 'D:/workspace/testAutoCopy'),
    out: get('--out', ''),
  };
};

const buildExportExpr = (frameName) => {
  const frameJson = JSON.stringify(frameName);
  return `(function(){
    const frameName = ${frameJson};
    const ccg = window.cc;
    if (!ccg?.director) return { ok: false, error: 'cc 未就绪' };
    const scene = ccg.director.getScene();
    const canvas = ccg.game?.canvas || document.querySelector('canvas');
    if (!scene || !canvas) return { ok: false, error: 'scene/canvas 未就绪' };

    const findComp = (n, re, ctor) => {
      if (ctor && n.getComponent) {
        try { const h = n.getComponent(ctor); if (h) return h; } catch (_) {}
      }
      return (n._components || []).find((c) => {
        const cn = c.__classname__ || c.constructor?.name || '';
        return re.test(cn);
      }) || null;
    };

    const walk = (node, parts, out) => {
      const sp = findComp(node, /Sprite/, ccg.Sprite);
      const frame = sp?.spriteFrame;
      const name = frame?.name || frame?._name || '';
      if (name === frameName) {
        out.push({ node, path: parts.join('/') });
      }
      for (const ch of node.children || []) {
        walk(ch, [...parts, ch.name || ''], out);
      }
    };

    const hits = [];
    walk(scene, [scene.name || 'main'], hits);
    if (!hits.length) return { ok: false, error: '未找到 frame ' + frameName };
    const pick = hits.find((h) => /symbolSprite$/.test(h.path) && !/Blur|_A/.test(h.path)) || hits[0];
    const node = pick.node;
    const path = pick.path;

    const sp = findComp(node, /Sprite/, ccg.Sprite);
    const frame = sp?.spriteFrame;
    const texture = frame?.texture || frame?._texture;
    if (!sp || !frame || !texture) return { ok: false, error: '无 Sprite/纹理', path };

    const rect = frame.rect || {};
    const os = frame.originalSize || {};
    const fw = Math.round(rect.width || 0);
    const fh = Math.round(rect.height || 0);
    const ow = Math.round(os.width || fw);
    const oh = Math.round(os.height || fh);
    const ox = frame.offset?.x ?? 0;
    const oy = frame.offset?.y ?? 0;
    const rotated = !!(frame.isRotated || frame._rotated);
    const texW = Math.floor(texture.width || 0);
    const texH = Math.floor(texture.height || 0);
    const trimX = Math.round((ow - fw) / 2 + ox);
    const trimY = Math.round((oh - fh) / 2 - oy);

    const cropAtlas = (pixels, tw, th, r, yFromBottom) => {
      const out = new Uint8ClampedArray(r.w * r.h * 4);
      let any = false;
      for (let row = 0; row < r.h; row++) {
        for (let col = 0; col < r.w; col++) {
          const srcY = yFromBottom ? th - r.y - r.h + row : r.y + row;
          const srcX = r.x + col;
          if (srcX < 0 || srcY < 0 || srcX >= tw || srcY >= th) continue;
          const si = (srcY * tw + srcX) * 4;
          const di = (row * r.w + col) * 4;
          out[di] = pixels[si];
          out[di + 1] = pixels[si + 1];
          out[di + 2] = pixels[si + 2];
          out[di + 3] = pixels[si + 3];
          if (out[di + 3] > 0) any = true;
        }
      }
      return any ? new ImageData(out, r.w, r.h) : null;
    };

    const unrotateCw = (img, lw, lh) => {
      const pw = img.width;
      const ph = img.height;
      const out = new Uint8ClampedArray(lw * lh * 4);
      for (let py = 0; py < ph; py++) {
        for (let px = 0; px < pw; px++) {
          const si = (py * pw + px) * 4;
          const lx = py;
          const ly = pw - 1 - px;
          const di = (ly * lw + lx) * 4;
          out[di] = img.data[si];
          out[di + 1] = img.data[si + 1];
          out[di + 2] = img.data[si + 2];
          out[di + 3] = img.data[si + 3];
        }
      }
      return new ImageData(out, lw, lh);
    };

    const unrotateCcw = (img, lw, lh) => {
      const pw = img.width;
      const ph = img.height;
      const out = new Uint8ClampedArray(lw * lh * 4);
      for (let py = 0; py < ph; py++) {
        for (let px = 0; px < pw; px++) {
          const si = (py * pw + px) * 4;
          const lx = ph - 1 - py;
          const ly = px;
          const di = (ly * lw + lx) * 4;
          out[di] = img.data[si];
          out[di + 1] = img.data[si + 1];
          out[di + 2] = img.data[si + 2];
          out[di + 3] = img.data[si + 3];
        }
      }
      return new ImageData(out, lw, lh);
    };

    const coverage = (img) => {
      let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (img.data[(y * img.width + x) * 4 + 3] > 8) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (maxX < minX) return 0;
      return ((maxX - minX + 1) * (maxY - minY + 1)) / (img.width * img.height);
    };

    const resolveRotated = (packed, lw, lh) => {
      const cw = unrotateCw(packed, lw, lh);
      const ccw = unrotateCcw(packed, lw, lh);
      return coverage(ccw) > coverage(cw) + 0.02 ? ccw : cw;
    };

    const toBase64 = (img) => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').putImageData(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    };

    const composite = (frameImg, cw, ch, tx, ty) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      const tmp = document.createElement('canvas');
      tmp.width = frameImg.width;
      tmp.height = frameImg.height;
      tmp.getContext('2d').putImageData(frameImg, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(tmp, tx, ty);
      return ctx.getImageData(0, 0, cw, ch);
    };

    let framePixels = null;
    let method = 'none';

    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const glTex = texture?.getGFXTexture?.()?.glTexture || texture?._gfxTexture?.glTexture;
      if (gl && glTex && texW > 0 && texH > 0) {
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, 0);
        const full = new Uint8Array(texW * texH * 4);
        gl.readPixels(0, 0, texW, texH, gl.RGBA, gl.UNSIGNED_BYTE, full);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fb);

        const atlasRect = { x: Math.round(rect.x), y: Math.round(rect.y), w: fw, h: fh };
        const packedRect = rotated
          ? { x: atlasRect.x, y: atlasRect.y, w: fh, h: fw }
          : atlasRect;
        let cropped = cropAtlas(full, texW, texH, packedRect, false);
        if (!cropped) cropped = cropAtlas(full, texW, texH, packedRect, true);
        if (cropped && rotated) cropped = resolveRotated(cropped, fw, fh);
        if (cropped) {
          framePixels = cropped;
          method = 'eval-webgl';
        }
      }
    } catch (e) {
      return { ok: false, error: 'webgl: ' + String(e), path };
    }

    if (!framePixels) return { ok: false, error: 'webgl 抠图失败', path };

    const composed = composite(framePixels, ow, oh, trimX, trimY);
    const base64 = toBase64(composed);

    return {
      ok: true,
      path,
      frameName,
      method,
      meta: {
        fw, fh, ow, oh, ox, oy, rotated,
        trim: { x: trimX, y: trimY },
        frameRect: { x: rect.x, y: rect.y, w: fw, h: fh },
      },
      png: { w: ow, h: oh },
      framePixels: { w: framePixels.width, h: framePixels.height },
      base64,
    };
  })()`;
};

const main = async () => {
  const args = parseArgs();
  const defaultOut = path.join(
    args.project,
    'assets/recovered/godeebxp/test',
    `${args.frameName}_eval.png`
  );
  const outAbs = args.out ? path.resolve(args.out) : defaultOut;

  console.error(`[export-eval] frame=${args.frameName} ws=${args.wsPort}`);
  await connectBridgeClientOnly(args.wsPort);
  await waitForExtension(60_000, args.wsPort);

  const expr = buildExportExpr(args.frameName);
  const wrapped = await callBridgeAtPort(args.wsPort, 'evalPage', [expr], {
    pageUrlMatch: args.pageUrlMatch,
  });
  const live = wrapped?.result ?? wrapped;
  if (!live?.ok) throw new Error(live?.error ?? JSON.stringify(wrapped));

  const buf = Buffer.from(live.base64, 'base64');
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, buf);

  const opaque = await measureOpaqueSharp(buf);
  const report = {
    ok: true,
    frameName: args.frameName,
    path: live.path,
    method: live.method,
    meta: live.meta,
    savedTo: outAbs,
    png: live.png,
    opaque,
    expectedTrim: live.meta.trim,
    verdict: opaque
      ? {
          dw: Math.abs(opaque.w - live.meta.fw),
          dh: Math.abs(opaque.h - live.meta.fh),
          dx: Math.abs(opaque.x - live.meta.trim.x),
          dy: Math.abs(opaque.y - live.meta.trim.y),
          ok:
            Math.abs(opaque.w - live.meta.fw) <= 4 &&
            Math.abs(opaque.h - live.meta.fh) <= 4 &&
            Math.abs(opaque.x - live.meta.trim.x) <= 4 &&
            Math.abs(opaque.y - live.meta.trim.y) <= 4,
        }
      : { ok: false },
  };

  console.log(JSON.stringify(report, null, 2));
  console.error(`[export-eval] 已写入 ${outAbs}`);
};

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
