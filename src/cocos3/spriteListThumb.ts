import { collectSpriteInspectData } from './spriteInspector';
import { extractAtlasFramePixels } from './textureExtract';

const THUMB_SIZE = 44;
const cache = new Map<string, string>();
const inflight = new Set<string>();
let queue: string[] = [];
let running = 0;
const MAX_CONCURRENT = 3;

function drawThumbToDataUrl(
  imageData: ImageData,
  size: number
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, size, size);

  const pw = imageData.width;
  const ph = imageData.height;
  if (pw <= 0 || ph <= 0) return null;

  const scale = Math.min(size / pw, size / ph);
  const dw = Math.max(1, Math.floor(pw * scale));
  const dh = Math.max(1, Math.floor(ph * scale));
  const dx = Math.floor((size - dw) / 2);
  const dy = Math.floor((size - dh) / 2);

  const tmp = document.createElement('canvas');
  tmp.width = pw;
  tmp.height = ph;
  tmp.getContext('2d')!.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, 0, 0, pw, ph, dx, dy, dw, dh);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function loadOne(nodeId: string): Promise<string | null> {
  const hit = cache.get(nodeId);
  if (hit) return hit;

  const base = collectSpriteInspectData(nodeId);
  if (!base) return null;

  const result = await extractAtlasFramePixels(
    base.spriteFrame,
    base.textureSize,
    {
      w: Math.min(THUMB_SIZE * 2, base.displaySize.w || THUMB_SIZE),
      h: Math.min(THUMB_SIZE * 2, base.displaySize.h || THUMB_SIZE),
    },
    nodeId
  );

  if (!result?.imageData) return null;

  const url = drawThumbToDataUrl(result.imageData, THUMB_SIZE);
  if (url) cache.set(nodeId, url);
  return url;
}

function pump(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift()!;
    if (cache.has(id) || inflight.has(id)) continue;
    inflight.add(id);
    running++;
    void loadOne(id).finally(() => {
      inflight.delete(id);
      running--;
      pump();
    });
  }
}

export function scheduleSpriteThumbnail(nodeId: string): void {
  if (!nodeId || cache.has(nodeId) || inflight.has(nodeId)) return;
  if (!queue.includes(nodeId)) queue.push(nodeId);
  pump();
}

export function getCachedSpriteThumbnail(nodeId: string): string | undefined {
  return cache.get(nodeId);
}

export function clearSpriteThumbnailQueue(): void {
  queue = [];
}

export function isSpriteThumbnailPending(nodeId: string): boolean {
  return inflight.has(nodeId) || queue.includes(nodeId);
}

/** 将缩略图填入列表项；列表重绘后需重新调用 */
export function applySpriteListThumbnails(container: HTMLElement): void {
  const slots = container.querySelectorAll<HTMLElement>('[data-thumb-for]');
  for (const slot of slots) {
    const id = slot.dataset.thumbFor;
    if (!id) continue;

    const cached = cache.get(id);
    if (cached) {
      slot.replaceChildren();
      const img = document.createElement('img');
      img.src = cached;
      img.alt = '';
      img.draggable = false;
      slot.appendChild(img);
      slot.classList.remove('sprite-list-thumb--loading', 'sprite-list-thumb--empty');
      continue;
    }

    slot.classList.add('sprite-list-thumb--loading');
    scheduleSpriteThumbnail(id);
  }
}

/** 轮询缓存，加载完成后写入 DOM（避免列表刷新打断） */
export function startSpriteThumbnailPoller(
  getContainer: () => HTMLElement | null
): () => void {
  const timer = window.setInterval(() => {
    const container = getContainer();
    if (!container?.classList.contains('active')) return;

    for (const slot of container.querySelectorAll<HTMLElement>(
      '[data-thumb-for].sprite-list-thumb--loading'
    )) {
      const id = slot.dataset.thumbFor;
      if (!id) continue;
      const url = cache.get(id);
      if (!url) continue;
      slot.replaceChildren();
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      slot.appendChild(img);
      slot.classList.remove('sprite-list-thumb--loading', 'sprite-list-thumb--empty');
    }

    for (const slot of container.querySelectorAll<HTMLElement>(
      '[data-thumb-for].sprite-list-thumb--loading'
    )) {
      const id = slot.dataset.thumbFor;
      if (!id || cache.has(id) || isSpriteThumbnailPending(id)) continue;
      slot.classList.remove('sprite-list-thumb--loading');
      slot.classList.add('sprite-list-thumb--empty');
    }
  }, 400);

  return () => window.clearInterval(timer);
}
