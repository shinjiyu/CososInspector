/**
 * 双路径纹理提取 trace：统一字段名，便于 MCP/localStorage 对比
 */

import { logTextureExtract } from './textureExtractLog';
import type { SpriteFrameRuntime } from './textureExtract';
import { resolveDisplaySize, resolveFrameRect } from './textureExtract';
import type { AtlasFrameRect } from './textureExtract';

export type ExtractPathId = 'legacy' | 'engine';

export interface OpaqueBBox {
  x: number;
  y: number;
  w: number;
  h: number;
  coverage: number;
}

export interface FrameCalcSnapshot {
  texW: number;
  texH: number;
  frameRect: AtlasFrameRect;
  isRotated: boolean;
  offset: { x: number; y: number };
  originalSize: { w: number; h: number };
  displaySize: { w: number; h: number };
  uv?: number[];
}

export interface ExtractPathTrace {
  path: ExtractPathId;
  meta: FrameCalcSnapshot;
  steps: Array<{
    step: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
  }>;
  finish?: {
    method: string;
    pixelSize: { w: number; h: number };
    opaque?: OpaqueBBox | null;
  };
}

export const measureOpaqueBBox = (img: ImageData | null): OpaqueBBox | null => {
  if (!img) return null;
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  const d = img.data;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (d[(y * img.width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return {
    x: minX,
    y: minY,
    w,
    h,
    coverage: (w * h) / (img.width * img.height),
  };
};

export const snapshotFrameCalc = (
  frame: SpriteFrameRuntime,
  texW: number,
  texH: number,
  displaySize?: { w: number; h: number }
): FrameCalcSnapshot => {
  const frameRect = resolveFrameRect(frame, texW, texH);
  const originalSize = resolveDisplaySize(frame, frameRect);
  const offset = frame.offset as { x?: number; y?: number } | undefined;
  return {
    texW,
    texH,
    frameRect,
    isRotated: !!(frame.isRotated || frame._rotated),
    offset: { x: offset?.x ?? 0, y: offset?.y ?? 0 },
    originalSize: { w: originalSize.w, h: originalSize.h },
    displaySize: {
      w: displaySize?.w ?? originalSize.w,
      h: displaySize?.h ?? originalSize.h,
    },
    uv: frame.uv?.length ? [...frame.uv.slice(0, 8)] : undefined,
  };
};

export const createPathTrace = (
  path: ExtractPathId,
  meta: FrameCalcSnapshot
): ExtractPathTrace => ({
  path,
  meta,
  steps: [],
});

type LogCtx = { nodeName: string; nodeUUID: string; frameName: string };

export const traceStep = (
  ctx: LogCtx,
  trace: ExtractPathTrace,
  step: string,
  params?: Record<string, unknown>,
  result?: Record<string, unknown>
): void => {
  trace.steps.push({ step, params, result });
  logTextureExtract(ctx, `[${trace.path}:${step}]`, {
    method: trace.path === 'legacy' ? 'legacy-trace' : 'engine-trim',
    frameRect: trace.meta.frameRect,
    detail: { path: trace.path, step, params, result },
  });
};

export const traceFinish = (
  ctx: LogCtx,
  trace: ExtractPathTrace,
  method: string,
  imageData: ImageData | null
): void => {
  const opaque = measureOpaqueBBox(imageData);
  trace.finish = {
    method,
    pixelSize: imageData
      ? { w: imageData.width, h: imageData.height }
      : { w: 0, h: 0 },
    opaque,
  };
  logTextureExtract(ctx, `[${trace.path}:finish]`, {
    method,
    pixelSize: trace.finish.pixelSize,
    detail: {
      path: trace.path,
      opaque,
      meta: trace.meta,
      steps: trace.steps.map((s) => s.step),
    },
  });
};

const cmpVal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

/** 对比两条路径的 meta / finish，标出首个不一致字段 */
export const logExtractPathCompare = (
  ctx: LogCtx,
  legacy: ExtractPathTrace | null,
  engine: ExtractPathTrace | null
): void => {
  const divergences: string[] = [];

  if (!legacy?.finish) divergences.push('legacy 未完成');
  if (!engine?.finish) divergences.push('engine 未完成');

  if (legacy && engine) {
    const pairs: Array<[string, unknown, unknown]> = [
      ['meta.frameRect', legacy.meta.frameRect, engine.meta.frameRect],
      ['meta.isRotated', legacy.meta.isRotated, engine.meta.isRotated],
      ['meta.offset', legacy.meta.offset, engine.meta.offset],
      ['meta.originalSize', legacy.meta.originalSize, engine.meta.originalSize],
      ['meta.displaySize', legacy.meta.displaySize, engine.meta.displaySize],
      [
        'finish.pixelSize',
        legacy.finish?.pixelSize,
        engine.finish?.pixelSize,
      ],
      [
        'finish.opaque.w×h',
        legacy.finish?.opaque
          ? `${legacy.finish.opaque.w}×${legacy.finish.opaque.h}`
          : null,
        engine.finish?.opaque
          ? `${engine.finish.opaque.w}×${engine.finish.opaque.h}`
          : null,
      ],
      [
        'finish.opaque.coverage',
        legacy.finish?.opaque?.coverage,
        engine.finish?.opaque?.coverage,
      ],
    ];
    for (const [key, lv, ev] of pairs) {
      if (!cmpVal(lv, ev)) {
        divergences.push(
          `${key}: legacy=${JSON.stringify(lv)} engine=${JSON.stringify(ev)}`
        );
      }
    }

    const legacyCrop = legacy.steps.find((s) => s.step === 'crop')?.result;
    const engineUnpack =
      engine.steps.find((s) => s.step === 'unrotate')?.result ??
      engine.steps.find((s) => s.step === 'crop-packed')?.result;
    if (legacyCrop && engineUnpack) {
      const lc = legacyCrop.pixelSize as { w: number; h: number } | undefined;
      const ec = engineUnpack.pixelSize as { w: number; h: number } | undefined;
      if (lc && ec && (lc.w !== ec.w || lc.h !== ec.h)) {
        divergences.push(
          `裁切后尺寸: legacy=${lc.w}×${lc.h} engine=${ec.w}×${ec.h}`
        );
      }
    }
  }

  logTextureExtract(ctx, '[compare] 双路径对比', {
    level: divergences.length ? 'warn' : 'info',
    detail: {
      divergences,
      legacy: legacy
        ? { meta: legacy.meta, finish: legacy.finish, steps: legacy.steps }
        : null,
      engine: engine
        ? { meta: engine.meta, finish: engine.finish, steps: engine.steps }
        : null,
    },
  });
};
