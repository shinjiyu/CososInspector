import { bakeSpriteFrameViaEngine } from './textureBake';
import { findNodeById, getSceneRoot } from './sceneTree';
import {
  clearTextureExtractDebugLog,
  extractAtlasViaWebGL,
  getTextureExtractDebugLog,
  readVisibleSpriteFromScreen,
} from './textureWebGL';

/** 图集帧在纹理上的像素区域（左上原点，与 SpriteFrame.rect 一致） */
export interface AtlasFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ExtractMethod =
  | 'dom-atlas'
  | 'url-atlas'
  | 'buffer-atlas'
  | 'readPixels-region'
  | 'readPixels-full'
  | 'engine-bake'
  | 'webgl-fbo'
  | 'device-copy'
  | 'screen-fbo';

export interface TextureExtractResult {
  imageData: ImageData;
  method: ExtractMethod;
}

export type TextureRuntime = {
  width?: number;
  height?: number;
  uuid?: string;
  _uuid?: string;
  getId?: () => string;
  readPixels?: (
    x?: number,
    y?: number,
    w?: number,
    h?: number,
    buffer?: ArrayBufferView
  ) => Promise<ArrayBufferView | null>;
  image?: ImageAssetRuntime;
  _nativeAsset?: unknown;
  _nativeUrl?: string;
  nativeUrl?: string;
};

export type ImageAssetRuntime = {
  data?: unknown;
  _data?: unknown;
  htmlElement?: CanvasImageSource;
  _nativeAsset?: unknown;
  nativeAsset?: { url?: string };
  nativeUrl?: string;
  _nativeUrl?: string;
  url?: string;
  _uuid?: string;
  uuid?: string;
  width?: number;
  height?: number;
  _mipmaps?: Array<{ data?: ArrayBufferView; width?: number; height?: number }>;
} & Record<string, unknown>;

export type SpriteFrameRuntime = {
  rect?: { x?: number; y?: number; width?: number; height?: number };
  uv?: number[];
  texture?: TextureRuntime;
  _texture?: TextureRuntime;
  isRotated?: boolean;
  _rotated?: boolean;
  width?: number;
  height?: number;
  originalSize?: { width?: number; height?: number; x?: number; y?: number };
  _originalSize?: { width?: number; height?: number };
  _original?: { _textureSource?: { _nativeAsset?: unknown } };
};

const pixelCache = new Map<string, TextureExtractResult>();
const pendingReads = new Map<string, Promise<TextureExtractResult | null>>();
const urlImageCache = new Map<string, HTMLImageElement>();

export function getAtlasCacheKey(
  texture: TextureRuntime,
  rect: AtlasFrameRect
): string {
  const id = texture.uuid ?? texture._uuid ?? texture.getId?.() ?? 'tex';
  return `${id}_${rect.x}_${rect.y}_${rect.w}_${rect.h}`;
}

export function isSpriteFrameRotated(frame: SpriteFrameRuntime): boolean {
  return !!(frame.isRotated || frame._rotated);
}

/**
 * TexturePacker / Cocos：rotated 帧在图集槽内顺时针 90° 存放。
 * 从槽位 rect 裁出的像素需再旋转 +90° 才与 originalSize 朝向一致。
 * （与 tools/fastspin-extractor 解包逻辑一致）
 */
export function uprightRotatedAtlasPixels(imageData: ImageData): ImageData {
  const sw = imageData.width;
  const sh = imageData.height;
  if (sw <= 0 || sh <= 0) return imageData;

  const dw = sh;
  const dh = sw;
  const out = document.createElement('canvas');
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext('2d');
  if (!ctx) return imageData;

  const tmp = document.createElement('canvas');
  tmp.width = sw;
  tmp.height = sh;
  tmp.getContext('2d')!.putImageData(imageData, 0, 0);

  ctx.translate(dw, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, sw, sh);

  return ctx.getImageData(0, 0, dw, dh);
}

/** 图集裁切类提取需还原旋转；屏幕截屏与引擎烘焙已是正确朝向 */
function finalizeAtlasExtractResult(
  result: TextureExtractResult,
  frame: SpriteFrameRuntime
): TextureExtractResult {
  if (!isSpriteFrameRotated(frame)) return result;
  if (result.method === 'screen-fbo' || result.method === 'engine-bake') {
    return result;
  }
  return {
    ...result,
    imageData: uprightRotatedAtlasPixels(result.imageData),
  };
}

export function resolveFrameRect(
  frame: SpriteFrameRuntime,
  texW: number,
  texH: number
): AtlasFrameRect {
  const r = frame.rect;
  if (r && (r.width ?? 0) > 0 && (r.height ?? 0) > 0) {
    let w = Math.round(r.width ?? 0);
    let h = Math.round(r.height ?? 0);
    let x = Math.round(r.x ?? 0);
    let y = Math.round(r.y ?? 0);

    return { x, y, w, h };
  }

  const uv = frame.uv;
  if (uv && uv.length >= 4 && texW > 0 && texH > 0) {
    let minU = 1;
    let minV = 1;
    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i + 1 < uv.length; i += 2) {
      minU = Math.min(minU, uv[i]);
      minV = Math.min(minV, uv[i + 1]);
      maxU = Math.max(maxU, uv[i]);
      maxV = Math.max(maxV, uv[i + 1]);
    }
    return {
      x: Math.round(minU * texW),
      y: Math.round(minV * texH),
      w: Math.round((maxU - minU) * texW),
      h: Math.round((maxV - minV) * texH),
    };
  }

  return { x: 0, y: 0, w: texW, h: texH };
}

/** 精灵显示尺寸（originalSize，不交换 rect） */
export function resolveDisplaySize(
  frame: SpriteFrameRuntime,
  atlasRect: AtlasFrameRect
): { w: number; h: number } {
  const os = frame.originalSize ?? frame._originalSize;
  if (os) {
    const w = Math.round(os.width ?? (os as { x?: number }).x ?? 0);
    const h = Math.round(os.height ?? (os as { y?: number }).y ?? 0);
    if (w > 0 && h > 0) return { w, h };
  }
  if (frame.width && frame.height) {
    return { w: Math.round(frame.width), h: Math.round(frame.height) };
  }
  return { w: atlasRect.w, h: atlasRect.h };
}

function resolveDomImage(texture?: TextureRuntime | null): CanvasImageSource | null {
  if (!texture) return null;
  const img = texture.image;
  const list: unknown[] = [
    img?.data,
    img?._data,
    img?.htmlElement,
    texture._nativeAsset,
    img?._nativeAsset,
    img?.nativeAsset,
    (img?.nativeAsset as { url?: string })?.url,
  ];
  for (const c of list) {
    if (
      c instanceof HTMLImageElement ||
      c instanceof HTMLCanvasElement ||
      c instanceof ImageBitmap
    ) {
      if (c instanceof HTMLImageElement && !c.complete) continue;
      if (
        c instanceof HTMLImageElement &&
        c.naturalWidth === 0 &&
        c.naturalHeight === 0
      ) {
        continue;
      }
      return c;
    }
  }
  return null;
}

export function collectAssetUrls(
  texture: TextureRuntime,
  imageAsset?: ImageAssetRuntime | null
): string[] {
  const urls = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v !== 'string' || v.length < 2) return;
    if (v.startsWith('db://') && !v.includes('http')) return;
    urls.add(v);
  };

  const objs: Record<string, unknown>[] = [];
  if (imageAsset) objs.push(imageAsset);
  objs.push(texture as Record<string, unknown>);

  for (const obj of objs) {
    for (const k of [
      'nativeUrl',
      '_nativeUrl',
      'url',
      '_url',
      'file',
      '_file',
      'path',
      '_path',
    ]) {
      add(obj[k]);
    }
    const na = obj.nativeAsset ?? obj._nativeAsset;
    if (na && typeof na === 'object') {
      add((na as { url?: string }).url);
      add((na as { _url?: string })._url);
    }
    if (typeof na === 'string') add(na);
  }

  const uuid = imageAsset?._uuid ?? imageAsset?.uuid ?? texture._uuid ?? texture.uuid;
  const ccg = window.cc as {
    assetManager?: {
      utils?: {
        getUrlWithUuid?: (
          uuid: string,
          opts?: { isNative?: boolean; ext?: string }
        ) => string;
      };
    };
  };
  const getUrl = ccg.assetManager?.utils?.getUrlWithUuid;
  if (uuid && getUrl) {
    try {
      add(getUrl(uuid, { isNative: true }));
      add(getUrl(uuid, { isNative: true, ext: '.png' }));
      add(getUrl(uuid, { isNative: true, ext: '.jpg' }));
      add(getUrl(uuid, { isNative: true, ext: '.webp' }));
    } catch {
      /* ignore */
    }
  }

  return [...urls];
}

function resolveFetchUrl(raw: string): string {
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('blob:') ||
    raw.startsWith('data:')
  ) {
    return raw;
  }
  try {
    return new URL(raw, window.location.href).href;
  } catch {
    return raw;
  }
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  const cached = urlImageCache.get(url);
  if (cached?.complete && cached.naturalWidth > 0) return cached;

  const href = resolveFetchUrl(url);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0) {
        urlImageCache.set(url, img);
        resolve(img);
      } else resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = href;
  });
}

function bufferToRgba(
  buf: ArrayBufferView,
  w: number,
  h: number
): Uint8ClampedArray | null {
  const need = w * h * 4;
  const u8 =
    buf instanceof Uint8Array
      ? buf
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  if (u8.length === need) {
    return new Uint8ClampedArray(u8.buffer, u8.byteOffset, u8.length);
  }

  if (u8.length === w * h * 3) {
    const out = new Uint8ClampedArray(need);
    for (let i = 0, j = 0; i < u8.length; i += 3, j += 4) {
      out[j] = u8[i];
      out[j + 1] = u8[i + 1];
      out[j + 2] = u8[i + 2];
      out[j + 3] = 255;
    }
    return out;
  }

  if (u8.length > need) {
    return new Uint8ClampedArray(u8.buffer, u8.byteOffset, need);
  }

  return null;
}

function hasVisiblePixels(data: ImageData): boolean {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0 || d[i] > 0 || d[i + 1] > 0 || d[i + 2] > 0) {
      return true;
    }
  }
  return false;
}

function cropFromFullBuffer(
  buf: ArrayBufferView,
  texW: number,
  texH: number,
  rect: AtlasFrameRect,
  yFromBottom: boolean
): ImageData | null {
  const full = bufferToRgba(buf, texW, texH);
  if (!full) return null;

  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let row = 0; row < rect.h; row++) {
    for (let col = 0; col < rect.w; col++) {
      const srcY = yFromBottom ? texH - rect.y - rect.h + row : rect.y + row;
      const srcX = rect.x + col;
      if (srcX < 0 || srcY < 0 || srcX >= texW || srcY >= texH) continue;
      const si = (srcY * texW + srcX) * 4;
      const di = (row * rect.w + col) * 4;
      out[di] = full[si];
      out[di + 1] = full[si + 1];
      out[di + 2] = full[si + 2];
      out[di + 3] = full[si + 3];
    }
  }
  return new ImageData(out, rect.w, rect.h);
}

function extractFromDomAtlas(
  source: CanvasImageSource,
  rect: AtlasFrameRect,
  method: ExtractMethod = 'dom-atlas'
): TextureExtractResult | null {
  const w = rect.w;
  const h = rect.h;
  if (w <= 0 || h <= 0) return null;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  if (!ctx) return null;

  try {
    ctx.drawImage(source, rect.x, rect.y, w, h, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    if (!hasVisiblePixels(imageData)) return null;
    return { imageData, method };
  } catch {
    return null;
  }
}

async function extractViaUrls(
  texture: TextureRuntime,
  rect: AtlasFrameRect
): Promise<TextureExtractResult | null> {
  const urls = collectAssetUrls(texture, texture.image);
  for (const url of urls) {
    const img = await loadImageFromUrl(url);
    if (!img) continue;
    const fullW = img.naturalWidth;
    const fullH = img.naturalHeight;
    if (fullW <= 0 || fullH <= 0) continue;

    const scaled = scaleRectToImage(rect, texture.width ?? fullW, texture.height ?? fullH, fullW, fullH);
    const result = extractFromDomAtlas(img, scaled, 'url-atlas');
    if (result) return result;
  }
  return null;
}

/** 图集 rect 基于纹理尺寸时，映射到真实图片像素尺寸 */
function scaleRectToImage(
  rect: AtlasFrameRect,
  texW: number,
  texH: number,
  imgW: number,
  imgH: number
): AtlasFrameRect {
  if (texW === imgW && texH === imgH) return rect;
  const sx = imgW / (texW || imgW);
  const sy = imgH / (texH || imgH);
  return {
    x: Math.round(rect.x * sx),
    y: Math.round(rect.y * sy),
    w: Math.round(rect.w * sx),
    h: Math.round(rect.h * sy),
  };
}

function extractViaRawBuffer(
  texture: TextureRuntime,
  rect: AtlasFrameRect
): TextureExtractResult | null {
  const img = texture.image;
  const texW = Math.floor(texture.width ?? 0);
  const texH = Math.floor(texture.height ?? 0);
  if (!img || texW <= 0 || texH <= 0) return null;

  const candidates: ArrayBufferView[] = [];
  const push = (v: unknown) => {
    if (v instanceof ArrayBuffer) {
      candidates.push(new Uint8Array(v));
    } else if (ArrayBuffer.isView(v)) {
      candidates.push(v);
    }
  };

  push(img.data);
  push(img._data);
  const mip = img._mipmaps?.[0]?.data;
  if (mip) push(mip);

  for (const buf of candidates) {
    const top = cropFromFullBuffer(buf, texW, texH, rect, false);
    if (top && hasVisiblePixels(top)) {
      return { imageData: top, method: 'buffer-atlas' };
    }
    const bottom = cropFromFullBuffer(buf, texW, texH, rect, true);
    if (bottom && hasVisiblePixels(bottom)) {
      return { imageData: bottom, method: 'buffer-atlas' };
    }
  }

  return null;
}

async function readRegionPixels(
  texture: TextureRuntime,
  rect: AtlasFrameRect,
  texH: number
): Promise<ImageData | null> {
  if (typeof texture.readPixels !== 'function') return null;

  const regions = [
    { x: rect.x, y: rect.y },
    { x: rect.x, y: texH - rect.y - rect.h },
  ];

  for (const region of regions) {
    try {
      const buf = await texture.readPixels(region.x, region.y, rect.w, rect.h);
      if (!buf) continue;
      const rgba = bufferToRgba(buf, rect.w, rect.h);
      if (!rgba) continue;
      const imageData = new ImageData(rgba, rect.w, rect.h);
      if (hasVisiblePixels(imageData)) return imageData;
    } catch {
      /* next */
    }
  }

  return null;
}

async function readFullAndCrop(
  texture: TextureRuntime,
  rect: AtlasFrameRect
): Promise<ImageData | null> {
  if (typeof texture.readPixels !== 'function') return null;

  const texW = Math.floor(texture.width ?? 0);
  const texH = Math.floor(texture.height ?? 0);
  if (texW <= 0 || texH <= 0) return null;

  try {
    const buf = await texture.readPixels(0, 0, texW, texH);
    if (!buf) return null;

    const top = cropFromFullBuffer(buf, texW, texH, rect, false);
    if (top && hasVisiblePixels(top)) return top;

    const bottom = cropFromFullBuffer(buf, texW, texH, rect, true);
    if (bottom && hasVisiblePixels(bottom)) return bottom;
  } catch {
    return null;
  }

  return null;
}

/**
 * 提取图集帧像素：URL/缓冲/DOM → readPixels → 引擎离屏渲染
 */
export async function extractAtlasFramePixels(
  frame: SpriteFrameRuntime,
  texSize: { w: number; h: number },
  displaySize?: { w: number; h: number },
  nodeId?: string | null
): Promise<TextureExtractResult | null> {
  const texture = frame.texture ?? frame._texture;
  if (!texture) return null;

  const texW = Math.floor(texture.width ?? texSize.w);
  const texH = Math.floor(texture.height ?? texSize.h);
  const rect = resolveFrameRect(frame, texW, texH);
  if (rect.w <= 0 || rect.h <= 0) return null;

  const cacheKey = `${getAtlasCacheKey(texture, rect)}_${nodeId ?? ''}`;
  const cached = pixelCache.get(cacheKey);
  if (cached) return cached;

  const pending = pendingReads.get(cacheKey);
  if (pending) return pending;

  const outW = displaySize?.w ?? rect.w;
  const outH = displaySize?.h ?? rect.h;

  const task = (async (): Promise<TextureExtractResult | null> => {
    clearTextureExtractDebugLog();
    await waitFrames(2);

    if (nodeId) {
      const scene = getSceneRoot();
      const node = scene ? findNodeById(scene, nodeId) : null;
      if (node) {
        const screen = readVisibleSpriteFromScreen(node, outW, outH);
        if (screen) {
          return { imageData: screen, method: 'screen-fbo' };
        }
      }
    }

    const webgl = extractAtlasViaWebGL(texture, rect);
    if (webgl) {
      return { imageData: webgl.imageData, method: webgl.method };
    }

    const dom = resolveDomImage(texture);
    if (dom) {
      const fromDom = extractFromDomAtlas(dom, rect, 'dom-atlas');
      if (fromDom) return fromDom;
    }

    const fromUrl = await extractViaUrls(texture, rect);
    if (fromUrl) return fromUrl;

    const fromBuf = extractViaRawBuffer(texture, rect);
    if (fromBuf) return fromBuf;

    const region = await readRegionPixels(texture, rect, texH);
    if (region) {
      return { imageData: region, method: 'readPixels-region' };
    }

    const full = await readFullAndCrop(texture, rect);
    if (full) {
      return { imageData: full, method: 'readPixels-full' };
    }

    const baked = await bakeSpriteFrameViaEngine(frame, { w: outW, h: outH });
    if (baked && hasVisiblePixels(baked)) {
      return { imageData: baked, method: 'engine-bake' };
    }

    return null;
  })();

  pendingReads.set(cacheKey, task);
  try {
    const result = await task;
    if (!result) return null;
    const finalized = finalizeAtlasExtractResult(result, frame);
    pixelCache.set(cacheKey, finalized);
    return finalized;
  } finally {
    pendingReads.delete(cacheKey);
  }
}

function waitFrames(n: number): Promise<void> {
  let left = n;
  return new Promise((resolve) => {
    const step = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export function clearTexturePixelCache(): void {
  pixelCache.clear();
  pendingReads.clear();
}

export { getTextureExtractDebugLog };
