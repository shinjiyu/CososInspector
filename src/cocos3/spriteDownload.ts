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

/** 按显示尺寸导出 PNG（使用已提取的像素，非预览缩放图） */
export function downloadSpritePng(data: SpriteInspectData): boolean {
  const pixels = data.pixels?.imageData;
  if (!pixels) return false;

  const w = data.displaySize.w || pixels.width;
  const h = data.displaySize.h || pixels.height;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = w;
  exportCanvas.height = h;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return false;

  const tmp = document.createElement('canvas');
  tmp.width = pixels.width;
  tmp.height = pixels.height;
  tmp.getContext('2d')!.putImageData(pixels, 0, 0);
  ctx.drawImage(tmp, 0, 0, pixels.width, pixels.height, 0, 0, w, h);

  const filename = buildSpriteDownloadFilename(data);

  if (exportCanvas.toBlob) {
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, filename);
    }, 'image/png');
    return true;
  }

  const url = exportCanvas.toDataURL('image/png');
  triggerDownloadDataUrl(url, filename);
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
