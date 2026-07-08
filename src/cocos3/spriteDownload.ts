import type { SpriteInspectData } from './spriteInspector';

const panelData = new WeakMap<HTMLElement, SpriteInspectData>();

export function setSpriteInspectorData(
  panel: HTMLElement,
  data: SpriteInspectData | null
): void {
  if (data) {
    panelData.set(panel, data);
  } else {
    panelData.delete(panel);
  }
}

export function getSpriteInspectorData(
  panel: HTMLElement
): SpriteInspectData | null {
  return panelData.get(panel) ?? null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\s]+/g, '_').replace(/_+/g, '_') || 'sprite';
}

export function buildSpriteDownloadFilename(data: SpriteInspectData): string {
  const node = sanitizeFilename(data.nodeName);
  const frame = sanitizeFilename(data.frameName);
  return `${node}_${frame}.png`;
}

export type SpriteExportPath = 'engine' | 'legacy' | 'auto';

export interface SpriteExportResult {
  ok: true;
  base64: string;
  width: number;
  height: number;
  filename: string;
  /** 实际使用的提取路径 */
  usedPath: 'engine' | 'legacy';
  /** 实际使用路径的提取方法（如 engine-trim / webgl-fbo） */
  method: string;
}

/**
 * 将已提取像素导出为 PNG base64（供 MCP / API 使用）
 *
 * - engine 路径：像素已是 originalSize 画布 + trim 合成，直接原生尺寸输出，不二次拉伸
 * - legacy 路径：图集裁切像素，按 displaySize 拉伸（保持旧行为）
 * - auto：有 enginePixels 用 engine，否则回退 legacy
 */
export function exportSpritePngBase64(
  data: SpriteInspectData,
  opts?: { path?: SpriteExportPath }
): SpriteExportResult | { ok: false; error: string } {
  const requested = opts?.path ?? 'auto';
  const enginePixels = data.enginePixels?.imageData ?? null;
  const legacyPixels = data.pixels?.imageData ?? null;

  let usedPath: 'engine' | 'legacy';
  if (requested === 'engine') {
    if (!enginePixels) {
      return { ok: false, error: '引擎对齐纹理未提取（engine 路径）' };
    }
    usedPath = 'engine';
  } else if (requested === 'legacy') {
    if (!legacyPixels) {
      return { ok: false, error: '纹理未提取，请先等待或重试（legacy 路径）' };
    }
    usedPath = 'legacy';
  } else {
    // auto：engine 优先，回退 legacy
    if (enginePixels) usedPath = 'engine';
    else if (legacyPixels) usedPath = 'legacy';
    else return { ok: false, error: '纹理未提取，请先等待或重试' };
  }

  const useEngine = usedPath === 'engine';
  const pixels = (useEngine ? enginePixels : legacyPixels)!;
  const method = useEngine
    ? data.engineExtractMethod || 'engine-trim'
    : data.extractMethod || 'legacy';

  // engine 已合成到 originalSize，输出原生尺寸；legacy 拉伸到 displaySize
  const w = useEngine ? pixels.width : data.displaySize.w || pixels.width;
  const h = useEngine ? pixels.height : data.displaySize.h || pixels.height;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = w;
  exportCanvas.height = h;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return { ok: false, error: '无法创建 canvas' };

  const tmp = document.createElement('canvas');
  tmp.width = pixels.width;
  tmp.height = pixels.height;
  tmp.getContext('2d')!.putImageData(pixels, 0, 0);
  ctx.drawImage(tmp, 0, 0, pixels.width, pixels.height, 0, 0, w, h);

  const dataUrl = exportCanvas.toDataURL('image/png');
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;

  return {
    ok: true,
    base64,
    width: w,
    height: h,
    filename: buildSpriteDownloadFilename(data),
    usedPath,
    method,
  };
}

/** 按显示尺寸导出 PNG（使用已提取的像素，非预览缩放图） */
export function downloadSpritePng(data: SpriteInspectData): boolean {
  const out = exportSpritePngBase64(data);
  if (!out.ok) return false;

  const bin = atob(out.base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  triggerDownload(new Blob([arr], { type: 'image/png' }), out.filename);
  return true;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerDownloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function bindSpriteDownloadButton(panel: HTMLElement): void {
  const btn = panel.querySelector(
    '.sprite-download-btn'
  ) as HTMLButtonElement | null;
  if (!btn || btn.dataset.bound === '1') return;

  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const data = getSpriteInspectorData(panel);
    if (!data || !downloadSpritePng(data)) {
      btn.title = '纹理未就绪，无法下载';
    }
  });
}
