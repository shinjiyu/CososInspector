import { findNodeById, getSceneRoot } from './sceneTree';
import { getSpriteMeta, nodeHasSprite } from './sprite';
import {
  extractAtlasFramePixels,
  getTextureExtractDebugLog,
  resolveDisplaySize,
  resolveFrameRect,
  type AtlasFrameRect,
  type TextureExtractResult,
} from './textureExtract';
import { extractEngineAlignedFramePixels } from './textureExtractEngine';
import { getTextureExtractLogs } from './textureExtractLog';
import {
  createPathTrace,
  logExtractPathCompare,
  snapshotFrameCalc,
} from './textureExtractTrace';
import {
  bindSpriteDownloadButton,
  setSpriteInspectorData,
} from './spriteDownload';
import {
  bindSpriteReplaceButtons,
  hasOriginalSpriteFrame,
  type SpriteReplaceCallbacks,
} from './spriteReplace';

export interface SpriteInspectData {
  nodeName: string;
  frameName: string;
  enabled: boolean;
  type: string;
  sizeMode: string;
  textureSize: { w: number; h: number };
  frameRect: AtlasFrameRect;
  displaySize: { w: number; h: number };
  offset: { x: number; y: number };
  originalSize: { w: number; h: number };
  isRotated: boolean;
  /** 运行时 SpriteFrame，供 readPixels 提取 */
  spriteFrame: SpriteFrameRuntime;
  /** 已提取的帧像素（图集裁切后） */
  pixels: TextureExtractResult | null;
  extractMethod: string;
  extractError: string | null;
  /** 引擎对齐路径（UV/旋转/trim → originalSize） */
  enginePixels: TextureExtractResult | null;
  engineExtractMethod: string;
  engineExtractError: string | null;
}

type SpriteComp = {
  enabled?: boolean;
  type?: number | string;
  sizeMode?: number | string;
  spriteFrame?: SpriteFrameRuntime | null;
};

export type SpriteFrameRuntime = {
  name?: string;
  _name?: string;
  rect?: { x?: number; y?: number; width?: number; height?: number };
  offset?: { x?: number; y?: number };
  originalSize?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  uv?: number[];
  texture?: import('./textureExtract').TextureRuntime | null;
  _texture?: import('./textureExtract').TextureRuntime | null;
  isRotated?: boolean;
};

function getSpriteCtor(): { new (): cc.Component } | null {
  const ccg = window.cc as typeof cc & {
    Sprite?: { new (): cc.Component };
  };
  return ccg.Sprite ?? null;
}

function getSpriteComponent(node: cc.Node): SpriteComp | null {
  const Sprite = getSpriteCtor();
  if (Sprite && typeof node.getComponent === 'function') {
    const comp = node.getComponent(Sprite);
    if (comp) return comp as SpriteComp;
  }

  const comps = (node as cc.Node & { _components?: unknown[] })._components ?? [];
  return (
    (comps.find((c) => {
      const cn =
        (c as { __classname__?: string }).__classname__ ??
        (c as { constructor?: { name?: string } }).constructor?.name ??
        '';
      return cn === 'cc.Sprite' || cn.endsWith('.Sprite');
    }) as SpriteComp) ?? null
  );
}

function readVec(v?: { x?: number; y?: number } | null): { x: number; y: number } {
  return { x: v?.x ?? 0, y: v?.y ?? 0 };
}

export function collectSpriteInspectData(
  nodeId: string | null
): SpriteInspectData | null {
  if (!nodeId) return null;
  const scene = getSceneRoot();
  if (!scene) return null;

  const node = findNodeById(scene, nodeId);
  if (!node || !nodeHasSprite(node)) return null;

  const comp = getSpriteComponent(node);
  const frame = comp?.spriteFrame;
  if (!frame) return null;

  const meta = getSpriteMeta(node);
  const texture = frame.texture ?? frame._texture;
  const texW = Math.floor(texture?.width ?? 0);
  const texH = Math.floor(texture?.height ?? 0);
  const frameRect = resolveFrameRect(frame, texW, texH);
  const displaySize = resolveDisplaySize(frame, frameRect);
  const offset = readVec(frame.offset);
  const originalSize = { ...displaySize };

  return {
    nodeName: node.name || '(unnamed)',
    frameName: meta?.frameName ?? frame.name ?? frame._name ?? '(无贴图)',
    enabled: comp?.enabled !== false,
    type: String(comp?.type ?? '-'),
    sizeMode: String(comp?.sizeMode ?? '-'),
    textureSize: { w: texW, h: texH },
    frameRect,
    displaySize,
    offset,
    originalSize,
    isRotated: !!(frame.isRotated || frame._rotated),
    spriteFrame: frame,
    pixels: null,
    extractMethod: '',
    extractError: null,
    enginePixels: null,
    engineExtractMethod: '',
    engineExtractError: null,
  };
}

const CHECKER = 8;

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  for (let y = 0; y < h; y += CHECKER) {
    for (let x = 0; x < w; x += CHECKER) {
      const odd = (x / CHECKER + y / CHECKER) % 2 === 0;
      ctx.fillStyle = odd ? '#555' : '#444';
      ctx.fillRect(x, y, CHECKER, CHECKER);
    }
  }
}

export function drawSpriteTexture(
  canvas: HTMLCanvasElement,
  data: SpriteInspectData,
  path: 'legacy' | 'engine' = 'legacy'
): boolean {
  const wrap = canvas.parentElement;
  const maxW = Math.max((wrap?.clientWidth ?? 200) - 8, 40);
  const maxH = Math.max((wrap?.clientHeight ?? 120) - 24, 40);

  const result = path === 'engine' ? data.enginePixels : data.pixels;
  const dw =
    path === 'engine'
      ? data.originalSize.w || result?.imageData.width || 1
      : data.displaySize.w || data.originalSize.w || 1;
  const dh =
    path === 'engine'
      ? data.originalSize.h || result?.imageData.height || 1
      : data.displaySize.h || data.originalSize.h || 1;
  const scale = Math.min(maxW / dw, maxH / dh, 4);
  const cw = Math.max(1, Math.floor(dw * scale));
  const ch = Math.max(1, Math.floor(dh * scale));

  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  drawCheckerboard(ctx, cw, ch);

  if (result?.imageData) {
    const pw = result.imageData.width;
    const ph = result.imageData.height;
    const tmp = document.createElement('canvas');
    tmp.width = pw;
    tmp.height = ph;
    tmp.getContext('2d')!.putImageData(result.imageData, 0, 0);
    ctx.drawImage(tmp, 0, 0, pw, ph, 0, 0, cw, ch);
    return true;
  }

  return false;
}

/** 需要计算的提取路径；仅导出单路径时可跳过另一条，避免大图双回读卡顿 */
export type EnrichPaths = 'both' | 'legacy' | 'engine';

export async function enrichSpriteInspectData(
  data: SpriteInspectData,
  nodeId: string | null,
  paths: EnrichPaths = 'both'
): Promise<SpriteInspectData> {
  const calcMeta = snapshotFrameCalc(
    data.spriteFrame,
    data.textureSize.w,
    data.textureSize.h,
    data.originalSize
  );
  const legacyTrace = createPathTrace('legacy', calcMeta);
  const engineTrace = createPathTrace('engine', calcMeta);
  const logCtx = {
    nodeName: data.nodeName,
    nodeUUID: nodeId ?? 'unknown',
    frameName: data.frameName,
  };

  const runLegacy = paths !== 'engine';
  const runEngine = paths !== 'legacy';

  const [legacyResult, engineResult] = await Promise.all([
    runLegacy
      ? extractAtlasFramePixels(
          data.spriteFrame,
          data.textureSize,
          data.originalSize,
          nodeId,
          legacyTrace
        )
      : Promise.resolve(null),
    runEngine
      ? extractEngineAlignedFramePixels(
          data.spriteFrame,
          data.textureSize,
          nodeId,
          engineTrace
        )
      : Promise.resolve(null),
  ]);

  // 仅在两路都跑时做对比日志
  if (runLegacy && runEngine) {
    logExtractPathCompare(logCtx, legacyTrace, engineTrace);
  }

  let next: SpriteInspectData = { ...data };

  if (!runLegacy) {
    // 未计算 legacy：保持字段为空，不覆盖
  } else if (legacyResult) {
    next = {
      ...next,
      pixels: legacyResult,
      extractMethod: legacyResult.method,
      extractError: null,
    };
  } else {
    const debug = getTextureExtractDebugLog().join(' · ');
    const lastLog = nodeId
      ? getTextureExtractLogs({ nodeUUID: nodeId, limit: 1 }).pop()
      : undefined;
    const logHint = lastLog?.message ?? debug;
    next = {
      ...next,
      pixels: null,
      extractMethod: '',
      extractError: logHint
        ? `图集提取失败：${logHint}`
        : '图集提取失败（GPU/URL/readPixels/引擎渲染均失败）',
    };
  }

  if (!runEngine) {
    // 未计算 engine：保持字段为空，不覆盖
  } else if (engineResult) {
    next = {
      ...next,
      enginePixels: engineResult,
      engineExtractMethod: engineResult.method,
      engineExtractError: null,
    };
  } else {
    next = {
      ...next,
      enginePixels: null,
      engineExtractMethod: '',
      engineExtractError: '引擎对齐提取失败（图集读取或 UV/trim 重建失败）',
    };
  }

  return next;
}

export function renderSpriteInspectorPanel(
  root: HTMLElement,
  data: SpriteInspectData | null,
  selectedId: string | null,
  loading = false
): void {
  const preview = root.querySelector(
    '.sprite-inspector-preview'
  ) as HTMLElement | null;
  const legacyCanvas = root.querySelector(
    '.sprite-inspector-canvas-legacy'
  ) as HTMLCanvasElement | null;
  const engineCanvas = root.querySelector(
    '.sprite-inspector-canvas-engine'
  ) as HTMLCanvasElement | null;
  const meta = root.querySelector('.sprite-inspector-meta') as HTMLElement | null;
  const empty = root.querySelector(
    '.sprite-inspector-empty'
  ) as HTMLElement | null;
  const legacyMeta = root.querySelector('.sprite-legacy-meta') as HTMLElement | null;
  const engineMeta = root.querySelector('.sprite-engine-meta') as HTMLElement | null;
  const legacyEmpty = root.querySelector('.sprite-legacy-empty') as HTMLElement | null;
  const engineEmpty = root.querySelector('.sprite-engine-empty') as HTMLElement | null;

  const downloadBtn = root.querySelector(
    '.sprite-download-btn'
  ) as HTMLButtonElement | null;
  const revertBtn = root.querySelector(
    '.sprite-revert-btn'
  ) as HTMLButtonElement | null;

  if (!preview || !legacyCanvas || !engineCanvas || !meta || !empty) return;

  const hideCanvases = (): void => {
    legacyCanvas.style.display = 'none';
    engineCanvas.style.display = 'none';
    if (legacyEmpty) legacyEmpty.style.display = 'none';
    if (engineEmpty) engineEmpty.style.display = 'none';
  };

  if (!selectedId) {
    setSpriteInspectorData(root, null);
    if (downloadBtn) downloadBtn.disabled = true;
    if (revertBtn) revertBtn.disabled = true;
    empty.style.display = 'flex';
    empty.textContent = '选中带 Sprite 的节点以预览纹理';
    hideCanvases();
    meta.innerHTML = '';
    return;
  }

  if (!data) {
    setSpriteInspectorData(root, null);
    if (downloadBtn) downloadBtn.disabled = true;
    if (revertBtn) revertBtn.disabled = true;
    empty.style.display = 'flex';
    empty.textContent = '当前节点无 Sprite 或无法读取贴图';
    hideCanvases();
    meta.innerHTML = '';
    return;
  }

  if (loading) {
    setSpriteInspectorData(root, null);
    if (downloadBtn) downloadBtn.disabled = true;
    if (revertBtn) revertBtn.disabled = true;
    empty.style.display = 'flex';
    empty.textContent = '正在提取纹理（双路径对比）…';
    hideCanvases();
    meta.innerHTML = buildMetaHtml(data, false, true);
    return;
  }

  empty.style.display = 'none';
  const legacyDrawn = drawSpriteTexture(legacyCanvas, data, 'legacy');
  const engineDrawn = drawSpriteTexture(engineCanvas, data, 'engine');

  if (legacyDrawn) {
    setSpriteInspectorData(root, data);
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.title = `下载 ${data.displaySize.w}×${data.displaySize.h} PNG`;
    }
  } else {
    setSpriteInspectorData(root, null);
    if (downloadBtn) downloadBtn.disabled = true;
  }

  if (revertBtn && selectedId) {
    revertBtn.disabled = !hasOriginalSpriteFrame(selectedId);
  }

  legacyCanvas.style.display = legacyDrawn ? 'block' : 'none';
  engineCanvas.style.display = engineDrawn ? 'block' : 'none';

  if (legacyMeta) {
    legacyMeta.textContent = legacyDrawn
      ? `· ${data.extractMethod} ${data.pixels?.imageData.width}×${data.pixels?.imageData.height}`
      : '';
  }
  if (engineMeta) {
    engineMeta.textContent = engineDrawn
      ? `· ${data.engineExtractMethod} ${data.enginePixels?.imageData.width}×${data.enginePixels?.imageData.height}`
      : '';
  }
  if (legacyEmpty) {
    legacyEmpty.textContent = legacyDrawn ? '' : (data.extractError ?? '无预览');
    legacyEmpty.style.display = legacyDrawn ? 'none' : 'block';
  }
  if (engineEmpty) {
    engineEmpty.textContent = engineDrawn ? '' : (data.engineExtractError ?? '无预览');
    engineEmpty.style.display = engineDrawn ? 'none' : 'block';
  }

  meta.innerHTML = buildMetaHtml(data, legacyDrawn || engineDrawn, false);
}

function buildMetaHtml(
  data: SpriteInspectData,
  drawn: boolean,
  loading: boolean
): string {
  return `
    <div class="meta-row"><span class="meta-label">节点</span>${escapeHtml(data.nodeName)}</div>
    <div class="meta-row"><span class="meta-label">贴图</span>${escapeHtml(data.frameName)}</div>
    <div class="meta-row"><span class="meta-label">图集区域</span>${data.frameRect.x}, ${data.frameRect.y} · ${data.frameRect.w}×${data.frameRect.h}</div>
    <div class="meta-row"><span class="meta-label">显示尺寸</span>${data.displaySize.w}×${data.displaySize.h}${data.isRotated ? ' · 旋转' : ''}</div>
    <div class="meta-row"><span class="meta-label">纹理</span>${data.textureSize.w}×${data.textureSize.h}</div>
    <div class="meta-row"><span class="meta-label">原尺寸</span>${data.originalSize.w}×${data.originalSize.h}</div>
    <div class="meta-row"><span class="meta-label">偏移</span>${data.offset.x}, ${data.offset.y}</div>
    <div class="meta-row"><span class="meta-label">状态</span>${data.enabled ? '启用' : '禁用'} · type ${escapeHtml(data.type)}</div>
    ${data.extractMethod ? `<div class="meta-row"><span class="meta-label">当前路径</span>${escapeHtml(data.extractMethod)}</div>` : ''}
    ${data.engineExtractMethod ? `<div class="meta-row"><span class="meta-label">引擎对齐</span>${escapeHtml(data.engineExtractMethod)}</div>` : ''}
    ${loading ? '<div class="meta-warn">正在提取图集帧…</div>' : ''}
    ${!loading && !drawn && data.extractError ? `<div class="meta-warn">${escapeHtml(data.extractError)}</div>` : ''}
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createSpriteInspectorElement(
  replaceCallbacks?: SpriteReplaceCallbacks
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sprite-inspector-panel';
  el.innerHTML = `
    <div class="sprite-inspector-title">Sprite Inspector</div>
    <div class="sprite-inspector-actions">
      <button type="button" class="sprite-download-btn" disabled>下载 PNG</button>
      <button type="button" class="sprite-upload-btn">上传替换</button>
      <button type="button" class="sprite-revert-btn" disabled>还原</button>
      <input type="file" class="sprite-upload-input" accept="image/png,image/jpeg,image/webp" hidden />
    </div>
    <div class="sprite-inspector-preview sprite-texture-compare-wrap">
      <div class="sprite-texture-compare-cols">
        <div class="sprite-texture-col">
          <div class="sprite-texture-col-head">当前路径 <span class="sprite-legacy-meta"></span></div>
          <canvas class="sprite-inspector-canvas-legacy"></canvas>
          <div class="sprite-texture-col-empty sprite-legacy-empty"></div>
        </div>
        <div class="sprite-texture-col">
          <div class="sprite-texture-col-head">引擎对齐 <span class="sprite-engine-meta"></span></div>
          <canvas class="sprite-inspector-canvas-engine"></canvas>
          <div class="sprite-texture-col-empty sprite-engine-empty"></div>
        </div>
      </div>
      <div class="sprite-inspector-empty">选中带 Sprite 的节点以预览纹理</div>
    </div>
    <div class="sprite-inspector-meta"></div>
  `;
  bindSpriteDownloadButton(el);
  if (replaceCallbacks) {
    bindSpriteReplaceButtons(el, replaceCallbacks);
  }
  return el;
}
