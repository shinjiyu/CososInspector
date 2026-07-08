#!/usr/bin/env node
/**
 * 用 evalPage 在 H5 验证符号导出（不改 Inspector）
 * 用法: node verify-symbol-export.mjs [--frame symbol_07] [--ws-port 17373]
 */
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
  };
};

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    frameName: get('--frame', 'symbol_07'),
    wsPort: Number(get('--ws-port', '17373')),
    pageUrlMatch: get('--page-url-match', 'godeebxp'),
    draw: !argv.includes('--no-draw'),
  };
};

const buildVerifyExpr = (frameName, draw) => {
  const frameJson = JSON.stringify(frameName);
  const drawFlag = draw ? 'true' : 'false';
  return `(function(){
    const frameName = ${frameJson};
    const draw = ${drawFlag};
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
    const { node, path } = hits.find((h) => /symbolSprite$/.test(h.path) && !/Blur|_A/.test(h.path)) || hits[0];

    const ui = findComp(node, /UITransform/, ccg.UITransform);
    const sp = findComp(node, /Sprite/, ccg.Sprite);
    const frame = sp?.spriteFrame;
    if (!ui || !frame) return { ok: false, error: '无 UITransform/Sprite', path };

    const rect = frame.rect || {};
    const os = frame.originalSize || {};
    const fw = Math.round(rect.width || 0);
    const fh = Math.round(rect.height || 0);
    const ow = Math.round(os.width || ui.contentSize?.width || fw);
    const oh = Math.round(os.height || ui.contentSize?.height || fh);
    const ox = frame.offset?.x ?? 0;
    const oy = frame.offset?.y ?? 0;
    const rotated = !!(frame.isRotated || frame._rotated);
    const sizeMode = sp.sizeMode ?? sp._sizeMode;

    const trimX = Math.round((ow - fw) / 2 + ox);
    const trimY = Math.round((oh - fh) / 2 - oy);

    const getUICam = () => {
      const go = (n) => {
        if (n.name === 'UICamera' && ccg.Camera) {
          const c = n.getComponent(ccg.Camera);
          if (c) return c;
        }
        for (const ch of n.children || []) {
          const h = go(ch);
          if (h) return h;
        }
        return null;
      };
      return go(scene);
    };
    const cam = getUICam();
    const cr = canvas.getBoundingClientRect();
    const Vec3 = ccg.Vec3;
    const toClient = (wx, wy) => {
      if (cam?.worldToScreen && Vec3) {
        const wp = new Vec3(wx, wy, 0);
        const out = new Vec3();
        cam.worldToScreen(wp, out);
        const sx = cr.width / canvas.width;
        const sy = cr.height / canvas.height;
        return { x: cr.left + out.x * sx, y: cr.top + (canvas.height - out.y) * sy };
      }
      return null;
    };

    const uiBbox = ui.getBoundingBoxToWorld();
    const uiCss = (() => {
      const p1 = toClient(uiBbox.x, uiBbox.y);
      const p2 = toClient(uiBbox.x + uiBbox.width, uiBbox.y + uiBbox.height);
      if (!p1 || !p2) return null;
      return {
        w: Math.abs(p2.x - p1.x),
        h: Math.abs(p2.y - p1.y),
        left: Math.min(p1.x, p2.x),
        top: Math.min(p1.y, p2.y),
      };
    })();

    const ax = ui.anchorPoint?.x ?? 0.5;
    const ay = ui.anchorPoint?.y ?? 0.5;
    const l = -ui.contentSize.width * ax + trimX;
    const b = -ui.contentSize.height * ay + trimY;
    const corners = [
      { x: l, y: b },
      { x: l + fw, y: b },
      { x: l + fw, y: b + fh },
      { x: l, y: b + fh },
    ];
    const frameClients = corners.map((p) => {
      const w = ui.convertToWorldSpaceAR(new Vec3(p.x, p.y, 0));
      return toClient(w.x, w.y);
    }).filter(Boolean);
    const xs = frameClients.map((p) => p.x);
    const ys = frameClients.map((p) => p.y);
    const frameCss = frameClients.length === 4 ? {
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
      left: Math.min(...xs),
      top: Math.min(...ys),
    } : null;

    let parentChain = [];
    let p = node.parent;
    while (p) {
      const pu = findComp(p, /UITransform/, ccg.UITransform);
      parentChain.push({
        name: p.name,
        scale: { x: p.scale?.x, y: p.scale?.y },
        content: pu ? { w: pu.contentSize?.width, h: pu.contentSize?.height } : null,
      });
      p = p.parent;
      if (parentChain.length > 6) break;
    }

    const texture = frame.texture || frame._texture;
    const texW = Math.floor(texture?.width || 0);
    const texH = Math.floor(texture?.height || 0);

    const cropAtlas = (pixels, tw, th, r, yFromBottom) => {
      const out = new Uint8ClampedArray(r.w * r.h * 4);
      let any = false;
      for (let row = 0; row < r.h; row++) {
        for (let col = 0; col < r.w; col++) {
          const srcY = yFromBottom ? th - r.y - r.h + row : r.y + row;
          const srcX = r.x + col;
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

    const unrotateImageData = (img) => {
      const w = img.width;
      const h = img.height;
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = (y * w + x) * 4;
          const nx = h - 1 - y;
          const ny = x;
          const di = (ny * h + nx) * 4;
          out[di] = img.data[si];
          out[di + 1] = img.data[si + 1];
          out[di + 2] = img.data[si + 2];
          out[di + 3] = img.data[si + 3];
        }
      }
      return new ImageData(out, h, w);
    };

    const measureOpaque = (img) => {
      let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const a = img.data[(y * img.width + x) * 4 + 3];
          if (a > 8) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (maxX < minX) return null;
      return { w: maxX - minX + 1, h: maxY - minY + 1, x: minX, y: minY };
    };

    const compositeCanvas = (frameImg, ow, oh, tx, ty) => {
      const c = document.createElement('canvas');
      c.width = ow;
      c.height = oh;
      const ctx = c.getContext('2d');
      const tmp = document.createElement('canvas');
      tmp.width = frameImg.width;
      tmp.height = frameImg.height;
      tmp.getContext('2d').putImageData(frameImg, 0, 0);
      ctx.clearRect(0, 0, ow, oh);
      ctx.drawImage(tmp, tx, ty);
      return ctx.getImageData(0, 0, ow, oh);
    };

    let extract = { method: 'none', framePixels: null };
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const glTex = texture?.getGFXTexture?.()?.glTexture || texture?._gfxTexture?.glTexture;
      if (gl && glTex && texW > 0) {
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, 0);
        const full = new Uint8Array(texW * texH * 4);
        gl.readPixels(0, 0, texW, texH, gl.RGBA, gl.UNSIGNED_BYTE, full);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fb);
        const atlasRect = { x: Math.round(rect.x), y: Math.round(rect.y), w: fw, h: fh };
        let cropped = cropAtlas(full, texW, texH, atlasRect, false);
        if (!cropped) cropped = cropAtlas(full, texW, texH, atlasRect, true);
        if (cropped && rotated) {
          const swapRect = { x: atlasRect.x, y: atlasRect.y, w: fh, h: fw };
          let alt = cropAtlas(full, texW, texH, swapRect, false);
          if (!alt) alt = cropAtlas(full, texW, texH, swapRect, true);
          if (alt) cropped = unrotateImageData(alt);
        }
        if (cropped) extract = { method: 'webgl-crop', framePixels: cropped };
      }
    } catch (e) {
      extract.error = String(e);
    }

    const exports = {};
    if (extract.framePixels) {
      const frameOpaque = measureOpaque(extract.framePixels);
      const composed = compositeCanvas(extract.framePixels, ow, oh, trimX, trimY);
      const composedOpaque = measureOpaque(composed);
      exports.frameOnly = { size: { w: extract.framePixels.width, h: extract.framePixels.height }, opaque: frameOpaque };
      exports.originalCanvas = { size: { w: ow, h: oh }, opaque: composedOpaque, trim: { x: trimX, y: trimY } };
      exports.expectedOpaque = { w: fw, h: fh, x: trimX, y: trimY };
      exports.compositeOk = composedOpaque &&
        Math.abs(composedOpaque.w - fw) <= 3 &&
        Math.abs(composedOpaque.h - fh) <= 3 &&
        Math.abs(composedOpaque.x - trimX) <= 3 &&
        Math.abs(composedOpaque.y - trimY) <= 3;
    }

    if (draw && frameCss && uiCss) {
      const host = document.getElementById('cocos-inspector-verify-export') || document.createElement('div');
      host.id = 'cocos-inspector-verify-export';
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
      host.replaceChildren();
      const addBox = (box, color, label) => {
        const el = document.createElement('div');
        el.style.cssText = [
          'position:fixed', 'left:' + box.left + 'px', 'top:' + box.top + 'px',
          'width:' + box.w + 'px', 'height:' + box.h + 'px',
          'border:3px solid ' + color, 'box-sizing:border-box',
        ].join(';');
        const t = document.createElement('div');
        t.textContent = label;
        t.style.cssText = 'position:absolute;top:-18px;left:0;color:' + color + ';font:bold 12px monospace;background:#000a;padding:1px 4px';
        el.appendChild(t);
        host.appendChild(el);
      };
      addBox(uiCss, '#f44', 'UITransform ' + Math.round(ui.contentSize.width) + 'x' + Math.round(ui.contentSize.height));
      addBox(frameCss, '#0f0', 'frame屏幕 ' + Math.round(frameCss.w) + 'x' + Math.round(frameCss.h));
      document.body.appendChild(host);
    }

    return {
      ok: true,
      path,
      nodeName: node.name,
      frameName,
      meta: { fw, fh, ow, oh, ox, oy, rotated, sizeMode, frameRect: { x: rect.x, y: rect.y, w: fw, h: fh }, trim: { x: trimX, y: trimY } },
      screenCss: { uiTransform: uiCss, frame: frameCss, uiVsFrame: uiCss && frameCss ? { wRatio: uiCss.w / frameCss.w, hRatio: uiCss.h / frameCss.h } : null },
      parentChain,
      extractMethod: extract.method,
      exports,
    };
  })()`;
};

const main = async () => {
  const args = parseArgs();
  await connectBridgeClientOnly(args.wsPort);
  await waitForExtension(60_000, args.wsPort);
  const expr = buildVerifyExpr(args.frameName, args.draw);
  const wrapped = await callBridgeAtPort(args.wsPort, 'evalPage', [expr], {
    pageUrlMatch: args.pageUrlMatch,
  });
  const live = wrapped?.result ?? wrapped;

  const sprites = await callBridgeAtPort(
    args.wsPort,
    'listSprites',
    [],
    { pageUrlMatch: args.pageUrlMatch }
  );
  const hit = (sprites ?? []).find(
    (s) =>
      s.frameName === args.frameName &&
      s.name === 'symbolSprite' &&
      !/Blur|_A/.test(s.path ?? '')
  );
  const inspector = {};
  if (hit?.id) {
    for (const mode of ['originalCanvas', 'frame', 'scale']) {
      const dl = await callBridgeAtPort(
        args.wsPort,
        'downloadTexture',
        [hit.id, { mode, delivery: 'inline' }],
        { pageUrlMatch: args.pageUrlMatch }
      );
      if (dl?.ok) {
        const buf = Buffer.from(dl.base64, 'base64');
        inspector[mode] = {
          png: { w: dl.width, h: dl.height },
          opaque: await measureOpaqueSharp(buf),
        };
      } else {
        inspector[mode] = { error: dl?.error ?? 'fail' };
      }
    }
  }

  const meta = live?.meta ?? {};
  const expected = {
    frame: { w: meta.fw, h: meta.fh },
    trim: meta.trim,
    original: { w: meta.ow, h: meta.oh },
  };
  const judge = (opaque) => {
    if (!opaque) return { ok: false, reason: 'no-opaque' };
    const dw = Math.abs(opaque.w - meta.fw);
    const dh = Math.abs(opaque.h - meta.fh);
    const dx = Math.abs(opaque.x - meta.trim.x);
    const dy = Math.abs(opaque.y - meta.trim.y);
    const stretched =
      opaque.w > meta.fw + 5 && opaque.w >= meta.ow - 5;
    return {
      ok: !stretched && dw <= 4 && dh <= 4 && dx <= 4 && dy <= 4,
      stretched,
      delta: { dw, dh, dx, dy },
    };
  };

  const report = {
    ok: true,
    frameName: args.frameName,
    nodeId: hit?.id,
    path: live?.path,
    h5Screen: live?.screenCss,
    parentCell: live?.parentChain?.[0],
    designMeta: meta,
    expected,
    inspectorExport: Object.fromEntries(
      Object.entries(inspector).map(([mode, v]) => [
        mode,
        { ...v, verdict: judge(v.opaque) },
      ])
    ),
    conclusion: null,
  };

  const oc = inspector.originalCanvas?.opaque;
  const fr = live?.screenCss?.frame;
  if (oc && fr) {
    const scaleX = fr.w / oc.w;
    const scaleY = fr.h / oc.h;
    report.conclusion = {
      h5VisibleCss: { w: Math.round(fr.w), h: Math.round(fr.h) },
      exportOpaque: oc,
      creatorIf152Box:
        '若 UITransform=152×128 且 PNG 不透明区铺满，会比绿框大约 ' +
        `${(live.screenCss.uiTransform.w / fr.w).toFixed(2)}×`,
      originalCanvasVerdict: judge(oc),
    };
  }

  console.log(JSON.stringify(report, null, 2));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
