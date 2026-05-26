/**
 * 图集子帧：将替换小图合成进 __res 中的整张 native 纹理（PNG 为主）
 */

export const SUPER_HTML_OASJIDX = 27;

/** 读取 __res 内 data URL：先去掉 super-html 第 27 位占位符再 base64 解码 */
export function normalizeResDataUrlForDecode(value) {
  const s = String(value || '');
  if (s.startsWith('data:') && s.length > SUPER_HTML_OASJIDX) {
    return s.slice(0, SUPER_HTML_OASJIDX) + s.slice(SUPER_HTML_OASJIDX + 1);
  }
  return s;
}

export function parseDataUrl(value) {
  const normalized = normalizeResDataUrlForDecode(value);
  const m = normalized.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], 'base64') };
}

export function dataUrlLength(mime, buf) {
  return `data:${mime};base64,`.length + buf.toString('base64').length;
}

export function applySuperHtmlOasjPlaceholder(dataUrl) {
  if (!dataUrl.startsWith('data:') || dataUrl.length <= SUPER_HTML_OASJIDX) {
    return dataUrl;
  }
  return dataUrl.slice(0, SUPER_HTML_OASJIDX) + '0' + dataUrl.slice(SUPER_HTML_OASJIDX);
}

/** 补全 manifest 里缺失的 frameRect.width/height，并修正越界坐标 */
export function normalizeFrameRect(rep, atlasW = 0, atlasH = 0) {
  const fr = rep?.original?.frameRect ?? {};
  const ds = rep?.original?.displaySize ?? {};
  const rot = !!rep?.original?.isRotated;
  let x = Math.round(fr.x ?? 0);
  let y = Math.round(fr.y ?? 0);
  let w = Math.round(fr.width ?? 0);
  let h = Math.round(fr.height ?? 0);
  const dw = Math.round(ds.width ?? 0);
  const dh = Math.round(ds.height ?? 0);

  if (w <= 0 || h <= 0) {
    if (rot && dw > 0 && dh > 0) {
      w = dh;
      h = dw;
    } else if (dw > 0 && dh > 0) {
      w = dw;
      h = dh;
    } else {
      w = Math.round(rep.replacement?.width ?? 1);
      h = Math.round(rep.replacement?.height ?? 1);
    }
  }

  if (atlasW > 0 && atlasH > 0 && (x + w > atlasW || y + h > atlasH)) {
    if (dw > 0 && dh > 0 && dw <= atlasW && dh <= atlasH) {
      x = 0;
      y = 0;
      if (rot) {
        w = dh;
        h = dw;
      } else {
        w = dw;
        h = dh;
      }
    }
  }

  return { x, y, width: w, height: h };
}

function repWithFrame(rep, frameRect) {
  return {
    ...rep,
    original: {
      ...rep.original,
      frameRect,
    },
  };
}

/** 帧区域明显小于整张纹理 → 图集子帧（非整图铺满） */
export function isAtlasReplacement(frameRect, atlasWidth, atlasHeight, rep) {
  const rw = frameRect.width;
  const rh = frameRect.height;
  if (!rw || !rh || !atlasWidth || !atlasHeight) return false;

  if (rw >= atlasWidth * 0.98 && rh >= atlasHeight * 0.98) return false;

  if (rw * rh < atlasWidth * atlasHeight * 0.92) return true;

  if (rw < atlasWidth * 0.98 || rh < atlasHeight * 0.98) {
    const repW = rep.replacement?.width ?? 0;
    const repH = rep.replacement?.height ?? 0;
    if (repW > 0 && repH > 0 && atlasWidth > repW && atlasHeight > repH) {
      return true;
    }
  }

  return false;
}

export function findAtlasTextureKey(resMap, rep, assetUrlToZipPath) {
  const pageUrl = rep.pageUrl || '';
  const candidates = new Set();

  for (const url of rep.original?.assetUrls ?? []) {
    const zp = assetUrlToZipPath(url, pageUrl);
    if (zp && /\.png$/i.test(zp) && /^data:image\//i.test(resMap[zp] || '')) {
      candidates.add(zp);
    }
  }

  for (const mk of rep.matchKeys ?? []) {
    if (!/\.png$/i.test(mk) || mk.length < 8) continue;
    for (const k of Object.keys(resMap)) {
      if (!/^data:image\/png/i.test(resMap[k] || '')) continue;
      if (k === mk || k.endsWith(mk) || k.includes(mk)) candidates.add(k);
    }
  }

  const stem = String(rep.original?.textureUuid || '').split('@')[0]?.trim();
  if (stem.length >= 8) {
    for (const k of Object.keys(resMap)) {
      if (!/^data:image\/png/i.test(resMap[k] || '')) continue;
      if (k.includes(stem)) candidates.add(k);
    }
  }

  return [...candidates];
}

/** 按 displaySize 匹配独立小图集（如 318×127 按钮图） */
export async function findAtlasByDisplaySize(resMap, rep) {
  const sharp = (await import('sharp')).default;
  const dw = Math.round(rep.original?.displaySize?.width ?? 0);
  const dh = Math.round(rep.original?.displaySize?.height ?? 0);
  if (dw <= 0 || dh <= 0) return null;

  let best = null;
  for (const k of Object.keys(resMap)) {
    if (!/^data:image\/png/i.test(resMap[k] || '')) continue;
    const p = parseDataUrl(resMap[k]);
    if (!p) continue;
    const m = await sharp(p.buffer).metadata();
    if (m.width === dw && m.height === dh) {
      if (!best || resMap[k].length < resMap[best].length) best = k;
    }
  }
  return best;
}

/** 帧矩形能放入的最小 PNG 图集 */
export async function findAtlasByRectFit(resMap, frameRect) {
  const sharp = (await import('sharp')).default;
  const fits = [];

  for (const k of Object.keys(resMap)) {
    if (!/^data:image\/png/i.test(resMap[k] || '')) continue;
    const p = parseDataUrl(resMap[k]);
    if (!p) continue;
    const m = await sharp(p.buffer).metadata();
    const aw = m.width ?? 0;
    const ah = m.height ?? 0;
    if (
      frameRect.x + frameRect.width <= aw &&
      frameRect.y + frameRect.height <= ah
    ) {
      fits.push({ k, area: aw * ah });
    }
  }

  fits.sort((a, b) => a.area - b.area);
  return fits[0]?.k ?? null;
}

export async function resolveAtlasNativeKey(resMap, rep, assetUrlToZipPath) {
  const sharp = (await import('sharp')).default;
  let keys = findAtlasTextureKey(resMap, rep, assetUrlToZipPath);

  if (keys.length === 0) {
    const bySize = await findAtlasByDisplaySize(resMap, rep);
    if (bySize) keys = [bySize];
  }

  if (keys.length === 0) {
    const fr0 = normalizeFrameRect(rep);
    const byRect = await findAtlasByRectFit(resMap, fr0);
    if (byRect) keys = [byRect];
  }

  if (keys.length === 0) {
    return null;
  }

  let bestKey = keys[0];
  let bestArea = 0;
  for (const k of keys) {
    const parsed = parseDataUrl(resMap[k]);
    if (!parsed) continue;
    const meta = await sharp(parsed.buffer).metadata();
    const area = (meta.width ?? 0) * (meta.height ?? 0);
    if (area > bestArea) {
      bestArea = area;
      bestKey = k;
    }
  }

  const parsed = parseDataUrl(resMap[bestKey]);
  if (!parsed) return null;
  const meta = await sharp(parsed.buffer).metadata();
  const frameRect = normalizeFrameRect(rep, meta.width, meta.height);

  return {
    key: bestKey,
    meta,
    frameRect,
    repForPatch: repWithFrame(rep, frameRect),
  };
}

export async function compositeAtlasFrame(atlasBuffer, patchPath, rep) {
  const sharp = (await import('sharp')).default;
  const fr = rep.original.frameRect;
  const isRotated = !!rep.original?.isRotated;
  const ds = rep.original?.displaySize ?? fr;

  const slotW = Math.max(1, Math.round(fr.width));
  const slotH = Math.max(1, Math.round(fr.height));
  const left = Math.max(0, Math.round(fr.x));
  const top = Math.max(0, Math.round(fr.y));
  const dispW = Math.max(1, Math.round(ds.width ?? slotW));
  const dispH = Math.max(1, Math.round(ds.height ?? slotH));

  let patch = sharp(patchPath).resize(dispW, dispH, { fit: 'fill' });
  if (isRotated) {
    patch = patch.rotate(90);
  }
  patch = patch.resize(slotW, slotH, { fit: 'fill' });

  const patchBuf = await patch.png().toBuffer();
  const meta = await sharp(atlasBuffer).metadata();
  if (left + slotW > (meta.width ?? 0) || top + slotH > (meta.height ?? 0)) {
    throw new Error(
      `帧区域 ${left},${top} ${slotW}x${slotH} 超出图集 ${meta.width}x${meta.height}`
    );
  }

  return sharp(atlasBuffer)
    .composite([{ input: patchBuf, left, top }])
    .png()
    .toBuffer();
}

export async function encodeBufferAsResDataUrl(buffer, mime, originalValue) {
  const maxLen =
    typeof originalValue === 'string' && originalValue.length > 0
      ? originalValue.length
      : 0;
  const sharp = (await import('sharp')).default;

  let out = buffer;
  if (mime === 'image/png') {
    let level = 6;
    while (maxLen > 0 && dataUrlLength(mime, out) + 1 > maxLen && level <= 9) {
      out = await sharp(buffer).png({ compressionLevel: level }).toBuffer();
      level++;
    }
  } else if (mime === 'image/jpeg') {
    let q = 88;
    while (maxLen > 0 && dataUrlLength(mime, out) + 1 > maxLen && q > 30) {
      q -= 5;
      out = await sharp(buffer).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    }
  }

  let outMime = mime;
  let dataUrl = applySuperHtmlOasjPlaceholder(
    `data:${outMime};base64,${out.toString('base64')}`
  );

  if (maxLen > 0 && dataUrl.length > maxLen && mime === 'image/png') {
    let q = 82;
    while (q >= 28) {
      out = await sharp(buffer).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      outMime = 'image/jpeg';
      dataUrl = applySuperHtmlOasjPlaceholder(
        `data:${outMime};base64,${out.toString('base64')}`
      );
      if (dataUrl.length <= maxLen) break;
      q -= 6;
    }
  }

  if (maxLen > 0 && dataUrl.length > maxLen) {
    throw new Error(
      `图集 data URL ${dataUrl.length} 超过原版 ${maxLen}，请缩小替换图或降低图集 PNG 体积`
    );
  }
  return dataUrl;
}

export async function patchAtlasInRes(resMap, rep, imagePath, assetUrlToZipPath) {
  const resolved = await resolveAtlasNativeKey(resMap, rep, assetUrlToZipPath);
  if (!resolved) {
    return { ok: false, reason: 'no-atlas-key' };
  }

  const { key: bestKey, meta, frameRect, repForPatch } = resolved;
  const originalValue = resMap[bestKey];
  const parsed = parseDataUrl(originalValue);
  if (!parsed) return { ok: false, reason: 'bad-data-url' };

  if (
    !isAtlasReplacement(frameRect, meta.width, meta.height, rep)
  ) {
    return { ok: false, reason: 'not-atlas', key: bestKey, frameRect };
  }

  const patched = await compositeAtlasFrame(
    parsed.buffer,
    imagePath,
    repForPatch
  );
  let dataUrl;
  try {
    dataUrl = await encodeBufferAsResDataUrl(
      patched,
      parsed.mime,
      originalValue
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/超过原版|too large/i.test(msg)) {
      return { ok: false, reason: 'too-large', key: bestKey };
    }
    throw e;
  }

  return {
    ok: true,
    key: bestKey,
    dataUrl,
    atlasSize: { w: meta.width, h: meta.height },
    frame: frameRect,
    rotated: !!rep.original?.isRotated,
  };
}
