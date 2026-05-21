import {
  buildReplacementRecordInput,
  captureOriginalSpriteSnapshot,
} from './replacementMeta';
import { saveReplacementPair } from './replacementStore';
import { findNodeById, getNodeId, getSceneRoot } from './sceneTree';
import { clearTexturePixelCache } from './textureExtract';

const originalFrames = new Map<string, unknown>();

export interface SpriteReplaceCallbacks {
  getNodeId: () => string | null;
  onReplaced: () => void;
  /** 替换对已记入本次会话（刷新页面会清空） */
  onPairSaved?: () => void;
}

function getCc(): Record<string, unknown> {
  return window.cc as unknown as Record<string, unknown>;
}

function getSpriteComponent(node: cc.Node): {
  spriteFrame?: unknown;
  enabled?: boolean;
} | null {
  const Sprite = (getCc().Sprite as { new (): cc.Component }) ?? null;
  if (Sprite && typeof node.getComponent === 'function') {
    return node.getComponent(Sprite) as { spriteFrame?: unknown };
  }
  const comps = (node as cc.Node & { _components?: unknown[] })._components ?? [];
  return (
    (comps.find((c) => {
      const cn =
        (c as { __classname__?: string }).__classname__ ??
        (c as { constructor?: { name?: string } }).constructor?.name ??
        '';
      return cn === 'cc.Sprite' || cn.endsWith('.Sprite');
    }) as { spriteFrame?: unknown }) ?? null
  );
}

function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

function createSpriteFrameFromImage(
  img: HTMLImageElement,
  label: string
): unknown {
  const ccg = getCc();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0) {
    throw new Error('图片尺寸无效');
  }

  const Texture2D = ccg.Texture2D as Texture2DCtor | undefined;
  const SpriteFrame = ccg.SpriteFrame as SpriteFrameCtor | undefined;
  const ImageAsset = ccg.ImageAsset as ImageAssetCtor | undefined;
  const Rect = ccg.Rect as RectCtor | undefined;
  const Size = ccg.Size as SizeCtor | undefined;
  const Vec2 = ccg.Vec2 as Vec2Ctor | undefined;

  if (!Texture2D || !SpriteFrame) {
    throw new Error('当前环境缺少 Texture2D / SpriteFrame');
  }

  let texture: TextureInstance;

  if (ImageAsset) {
    const imageAsset = new ImageAsset();
    if (typeof imageAsset.reset === 'function') {
      imageAsset.reset(img);
    } else if (typeof imageAsset._reset === 'function') {
      (imageAsset as { _reset: (i: HTMLImageElement) => void })._reset(img);
    }
    texture = new Texture2D();
    texture.image = imageAsset;
    if (typeof texture.reset === 'function') {
      texture.reset({ width: w, height: h });
    }
    if (typeof texture.uploadData === 'function') {
      try {
        texture.uploadData(img);
      } catch {
        try {
          texture.uploadData(imageAsset);
        } catch {
          /* 部分版本仅 reset 即可 */
        }
      }
    }
  } else {
    texture = new Texture2D();
    if (typeof texture.reset === 'function') {
      texture.reset({ width: w, height: h });
    }
    if (typeof texture.uploadData === 'function') {
      texture.uploadData(img);
    }
  }

  const sf = new SpriteFrame();
  sf.texture = texture;

  if (Rect && Size) {
    sf.rect = new Rect(0, 0, w, h);
    sf.originalSize = new Size(w, h);
  } else {
    sf.rect = { x: 0, y: 0, width: w, height: h };
    sf.originalSize = { width: w, height: h };
  }

  if (Vec2) {
    sf.offset = new Vec2(0, 0);
  } else {
    sf.offset = { x: 0, y: 0 };
  }

  sf.name = label.replace(/\.[^.]+$/, '') || 'uploaded';

  return sf;
}

function syncNodeSize(node: cc.Node, w: number, h: number): void {
  const UITransform = getCc().UITransform as UITransformCtor | undefined;
  if (!UITransform || typeof node.getComponent !== 'function') return;
  const ui = node.getComponent(UITransform) as UITransformInstance | null;
  if (ui?.setContentSize) {
    ui.setContentSize(w, h);
  }
}

export function hasOriginalSpriteFrame(nodeId: string): boolean {
  return originalFrames.has(nodeId);
}

export async function replaceSpriteWithImageFile(
  nodeId: string,
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    return { ok: false, error: '仅支持 PNG / JPG / WebP' };
  }

  const scene = getSceneRoot();
  if (!scene) return { ok: false, error: '场景未就绪' };

  const node = findNodeById(scene, nodeId);
  if (!node) return { ok: false, error: '节点不存在' };

  const sprite = getSpriteComponent(node);
  if (!sprite) return { ok: false, error: '节点无 Sprite 组件' };

  try {
    const img = await loadImageFile(file);
    const id = getNodeId(node);

    if (!originalFrames.has(id) && sprite.spriteFrame) {
      originalFrames.set(id, sprite.spriteFrame);
    }

    const originalSnapshot = captureOriginalSpriteSnapshot(nodeId);

    const newFrame = createSpriteFrameFromImage(img, file.name);
    sprite.spriteFrame = newFrame;

    syncNodeSize(node, img.naturalWidth, img.naturalHeight);

    clearTexturePixelCache();

    try {
      const record = buildReplacementRecordInput(
        nodeId,
        file,
        file,
        img.naturalWidth,
        img.naturalHeight,
        originalSnapshot
      );
      if (record) await saveReplacementPair(record);
    } catch {
      /* 记录失败不影响运行时替换 */
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function revertSpriteFrame(
  nodeId: string
): { ok: true } | { ok: false; error: string } {
  const original = originalFrames.get(nodeId);
  if (!original) {
    return { ok: false, error: '没有可还原的原始 SpriteFrame' };
  }

  const scene = getSceneRoot();
  if (!scene) return { ok: false, error: '场景未就绪' };

  const node = findNodeById(scene, nodeId);
  if (!node) return { ok: false, error: '节点不存在' };

  const sprite = getSpriteComponent(node);
  if (!sprite) return { ok: false, error: '节点无 Sprite 组件' };

  sprite.spriteFrame = original;
  originalFrames.delete(nodeId);
  clearTexturePixelCache();

  return { ok: true };
}

export function bindSpriteReplaceButtons(
  panel: HTMLElement,
  callbacks: SpriteReplaceCallbacks
): void {
  const uploadBtn = panel.querySelector(
    '.sprite-upload-btn'
  ) as HTMLButtonElement | null;
  const revertBtn = panel.querySelector(
    '.sprite-revert-btn'
  ) as HTMLButtonElement | null;
  const fileInput = panel.querySelector(
    '.sprite-upload-input'
  ) as HTMLInputElement | null;

  if (!uploadBtn || !fileInput || uploadBtn.dataset.bound === '1') return;

  uploadBtn.dataset.bound = '1';

  uploadBtn.addEventListener('click', () => {
    const nodeId = callbacks.getNodeId();
    if (!nodeId) {
      uploadBtn.title = '请先选中带 Sprite 的节点';
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    const nodeId = callbacks.getNodeId();
    if (!nodeId) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = '上传中…';

    const result = await replaceSpriteWithImageFile(nodeId, file);

    uploadBtn.disabled = false;
    uploadBtn.textContent = '上传替换';

    if (result.ok) {
      if (revertBtn) revertBtn.disabled = false;
      callbacks.onReplaced();
      callbacks.onPairSaved?.();
    } else {
      uploadBtn.title = result.error;
    }
  });

  if (revertBtn && revertBtn.dataset.bound !== '1') {
    revertBtn.dataset.bound = '1';
    revertBtn.addEventListener('click', () => {
      const nodeId = callbacks.getNodeId();
      if (!nodeId) return;
      const result = revertSpriteFrame(nodeId);
      if (result.ok) {
        revertBtn.disabled = true;
        callbacks.onReplaced();
      } else {
        revertBtn.title = result.error;
      }
    });
  }
}

type Texture2DCtor = new () => TextureInstance;
type SpriteFrameCtor = new () => SpriteFrameInstance;
type ImageAssetCtor = new () => ImageAssetInstance;
type RectCtor = new (x: number, y: number, w: number, h: number) => unknown;
type SizeCtor = new (w: number, h: number) => unknown;
type Vec2Ctor = new (x: number, y: number) => unknown;
type UITransformCtor = new () => UITransformInstance;

interface TextureInstance {
  image?: unknown;
  reset?: (o: { width: number; height: number }) => void;
  uploadData?: (data: unknown) => void;
}

interface ImageAssetInstance {
  reset?: (img: HTMLImageElement) => void;
}

interface SpriteFrameInstance {
  texture?: unknown;
  rect?: unknown;
  originalSize?: unknown;
  offset?: unknown;
  name?: string;
}

interface UITransformInstance {
  setContentSize: (w: number, h: number) => void;
}
