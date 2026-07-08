/**
 * 与 Cocos SpriteFrame 提交 draw 语义对齐的纹理重建：
 * pack rect 裁切 → 旋转展开 → originalSize 画布 + trim 偏移
 */

import { logTextureExtract } from './textureExtractLog';
import type { SpriteFrameRuntime, TextureExtractResult } from './textureExtract';
import { resolveDisplaySize, resolveFrameRect } from './textureExtract';
import type { ExtractPathTrace } from './textureExtractTrace';
import {
  createPathTrace,
  measureOpaqueBBox,
  snapshotFrameCalc,
  traceFinish,
  traceStep,
} from './textureExtractTrace';
import { findNodeById, getSceneRoot } from './sceneTree';
import {
  cropAtlasRegion,
  extractAtlasViaWebGL,
  readFullAtlasImageData,
} from './textureWebGL';

const resolveLogCtx = (
  nodeId: string | null | undefined,
  frame: SpriteFrameRuntime
): { nodeName: string; nodeUUID: string; frameName: string } => {
  const nodeUUID = nodeId ?? 'unknown';
  let nodeName = 'unknown';
  if (nodeId) {
    const scene = getSceneRoot();
    const node = scene ? findNodeById(scene, nodeId) : null;
    if (node) nodeName = node.name ?? 'unknown';
  }
  const fr = frame as { name?: string; _name?: string };
  const frameName = String(fr.name ?? fr._name ?? 'spriteFrame');
  return { nodeName, nodeUUID, frameName };
};

const readOffset = (frame: SpriteFrameRuntime): { x: number; y: number } => {
  const o = frame.offset as { x?: number; y?: number } | undefined;
  return { x: o?.x ?? 0, y: o?.y ?? 0 };
};

const opaqueCoverage = (img: ImageData): number => {
  const box = measureOpaqueBBox(img);
  return box?.coverage ?? 0;
};

const unrotateCw = (img: ImageData, lw: number, lh: number): ImageData => {
  const pw = img.width;
  const ph = img.height;
  const out = new Uint8ClampedArray(lw * lh * 4);
  for (let py = 0; py < ph; py += 1) {
    for (let px = 0; px < pw; px += 1) {
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

const unrotateCcw = (img: ImageData, lw: number, lh: number): ImageData => {
  const pw = img.width;
  const ph = img.height;
  const out = new Uint8ClampedArray(lw * lh * 4);
  for (let py = 0; py < ph; py += 1) {
    for (let px = 0; px < pw; px += 1) {
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

const resolveRotatedWithTrace = (
  packed: ImageData,
  fw: number,
  fh: number
): { image: ImageData; picked: 'cw' | 'ccw'; cwCoverage: number; ccwCoverage: number } => {
  const cw = unrotateCw(packed, fw, fh);
  const ccw = unrotateCcw(packed, fw, fh);
  const cwCoverage = opaqueCoverage(cw);
  const ccwCoverage = opaqueCoverage(ccw);
  // Cocos 图集 isRotated：打包时顺时针 90°，还原应 ccw；coverage 平局时无法区分方向
  const picked =
    cwCoverage > ccwCoverage + 0.02
      ? 'cw'
      : 'ccw';
  return {
    image: picked === 'ccw' ? ccw : cw,
    picked,
    cwCoverage,
    ccwCoverage,
  };
};

const compositeOnOriginal = (
  frameImg: ImageData,
  ow: number,
  oh: number,
  trimX: number,
  trimY: number
): ImageData => {
  const out = new Uint8ClampedArray(ow * oh * 4);
  const fd = frameImg.data;
  const fw = frameImg.width;
  const fh = frameImg.height;
  for (let y = 0; y < fh; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      const dstX = trimX + x;
      const dstY = trimY + y;
      if (dstX < 0 || dstY < 0 || dstX >= ow || dstY >= oh) continue;
      const si = (y * fw + x) * 4;
      const di = (dstY * ow + dstX) * 4;
      out[di] = fd[si];
      out[di + 1] = fd[si + 1];
      out[di + 2] = fd[si + 2];
      out[di + 3] = fd[si + 3];
    }
  }
  return new ImageData(out, ow, oh);
};

export const extractEngineAlignedFramePixels = async (
  frame: SpriteFrameRuntime,
  texSize: { w: number; h: number },
  nodeId?: string | null,
  traceOut?: ExtractPathTrace
): Promise<TextureExtractResult | null> => {
  const texture = frame.texture ?? frame._texture;
  if (!texture) return null;

  const texW = Math.floor(texture.width ?? texSize.w);
  const texH = Math.floor(texture.height ?? texSize.h);
  const rect = resolveFrameRect(frame, texW, texH);
  if (rect.w <= 0 || rect.h <= 0) return null;

  const logCtx = resolveLogCtx(nodeId, frame);
  const calcMeta = snapshotFrameCalc(frame, texW, texH);
  const trace = traceOut ?? createPathTrace('engine', calcMeta);
  const isRotated = calcMeta.isRotated;
  const offset = readOffset(frame);
  const fw = rect.w;
  const fh = rect.h;
  const ow = calcMeta.originalSize.w;
  const oh = calcMeta.originalSize.h;
  const trimX = Math.round((ow - fw) / 2 + offset.x);
  const trimY = Math.round((oh - fh) / 2 - offset.y);
  const atlasRect = { x: rect.x, y: rect.y, w: fw, h: fh };
  const packedRect = isRotated
    ? { x: rect.x, y: rect.y, w: fh, h: fw }
    : atlasRect;

  traceStep(logCtx, trace, 'meta', {
    ...calcMeta,
    fw,
    fh,
    trimX,
    trimY,
    trimFormula: {
      trimX: `(ow-fw)/2+ox = (${ow}-${fw})/2+${offset.x}`,
      trimY: `(oh-fh)/2-oy = (${oh}-${fh})/2-${offset.y}`,
    },
    atlasRect,
    packedRect,
  });

  logTextureExtract(logCtx, '引擎对齐：开始', {
    method: 'engine-trim',
    frameRect: rect,
    pixelSize: { w: ow, h: oh },
    detail: { isRotated, fw, fh, trimX, trimY, offset, packedRect },
  });

  try {
    const atlas = readFullAtlasImageData(texture, texW, texH);
    if (!atlas) {
      traceFinish(logCtx, trace, 'failed-read-atlas', null);
      logTextureExtract(logCtx, '引擎对齐：读图集失败', {
        level: 'error',
        method: 'engine-trim',
      });
      return null;
    }

    traceStep(logCtx, trace, 'read-atlas', { texW, texH }, {
      pixelSize: { w: atlas.width, h: atlas.height },
    });

    // 与 legacy webgl-fbo 同裁切：atlasRect 直裁；GPU 图集上 isRotated 仅影响 UV，不必 unrotate
    let framePixels =
      extractAtlasViaWebGL(texture, atlasRect)?.imageData ??
      cropAtlasRegion(atlas.data, texW, texH, atlasRect);
    let cropMode: 'atlas-direct' | 'packed-unrotate' = 'atlas-direct';

    if (framePixels) {
      traceStep(
        logCtx,
        trace,
        'crop-atlas',
        { atlasRect, isRotated },
        {
          pixelSize: { w: framePixels.width, h: framePixels.height },
          opaque: measureOpaqueBBox(framePixels),
          note: '与 legacy 同 rect 直裁，跳过 unrotate',
        }
      );
    } else if (isRotated) {
      cropMode = 'packed-unrotate';
      let packed = cropAtlasRegion(atlas.data, texW, texH, packedRect);
      if (!packed) {
        traceFinish(logCtx, trace, 'failed-crop', null);
        logTextureExtract(logCtx, '引擎对齐：pack 裁切失败', {
          level: 'error',
          method: 'engine-trim',
          detail: { packedRect, atlasRect },
        });
        return null;
      }

      traceStep(
        logCtx,
        trace,
        'crop-packed',
        { packedRect },
        {
          pixelSize: { w: packed.width, h: packed.height },
          opaque: measureOpaqueBBox(packed),
        }
      );

      const unr = resolveRotatedWithTrace(packed, fw, fh);
      framePixels = unr.image;
      traceStep(
        logCtx,
        trace,
        'unrotate',
        { fw, fh, packedSize: { w: packed.width, h: packed.height } },
        {
          picked: unr.picked,
          cwCoverage: unr.cwCoverage,
          ccwCoverage: unr.ccwCoverage,
          pixelSize: { w: framePixels.width, h: framePixels.height },
          opaque: measureOpaqueBBox(framePixels),
        }
      );
    } else {
      traceFinish(logCtx, trace, 'failed-crop', null);
      logTextureExtract(logCtx, '引擎对齐：atlas 裁切失败', {
        level: 'error',
        method: 'engine-trim',
        detail: { atlasRect },
      });
      return null;
    }

    const canvas = compositeOnOriginal(framePixels, ow, oh, trimX, trimY);
    traceStep(
      logCtx,
      trace,
      'composite',
      { ow, oh, trimX, trimY, framePixels: { w: framePixels.width, h: framePixels.height } },
      {
        pixelSize: { w: canvas.width, h: canvas.height },
        opaque: measureOpaqueBBox(canvas),
      }
    );

    traceFinish(logCtx, trace, 'engine-trim', canvas);
    logTextureExtract(logCtx, '引擎对齐：成功', {
      method: 'engine-trim',
      pixelSize: { w: canvas.width, h: canvas.height },
      detail: {
        framePixels: { w: framePixels.width, h: framePixels.height },
        cropMode,
        isRotated,
      },
    });

    return { imageData: canvas, method: 'engine-trim' };
  } catch (e) {
    traceFinish(logCtx, trace, 'failed-exception', null);
    logTextureExtract(logCtx, '引擎对齐：异常', {
      level: 'error',
      method: 'engine-trim',
      detail: { error: e instanceof Error ? e.message : String(e) },
    });
    return null;
  }
};
