import { buildNodePath, findNodeById, getNodeId, getSceneRoot } from './sceneTree';
import {
  collectAssetUrls,
  resolveFrameRect,
  type TextureRuntime,
} from './textureExtract';

function frameRectForSnapshot(
  frame: SpriteFrameRuntime,
  texture: TextureRuntime | null | undefined
): OriginalSpriteSnapshot['frameRect'] {
  const texW = Math.floor(texture?.width ?? 0);
  const texH = Math.floor(texture?.height ?? 0);
  const rect = resolveFrameRect(frame, texW, texH);
  return {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
  };
}
import type { SpriteFrameRuntime } from './spriteInspector';

export interface OriginalSpriteSnapshot {
  frameName: string;
  textureUuid: string;
  textureName: string;
  assetUrls: string[];
  frameRect: { x: number; y: number; width: number; height: number };
  displaySize: { width: number; height: number };
  isRotated: boolean;
}

export interface ReplacementRecordInput {
  nodeId: string;
  nodeName: string;
  nodePath: string;
  original: OriginalSpriteSnapshot;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  imageBlob: Blob;
}

function getSpriteComponent(node: cc.Node): { spriteFrame?: SpriteFrameRuntime | null } | null {
  const ccg = window.cc as typeof cc & { Sprite?: { new (): cc.Component } };
  const Sprite = ccg.Sprite;
  if (Sprite && typeof node.getComponent === 'function') {
    return node.getComponent(Sprite) as { spriteFrame?: SpriteFrameRuntime | null };
  }
  const comps = (node as cc.Node & { _components?: unknown[] })._components ?? [];
  return (
    (comps.find((c) => {
      const cn =
        (c as { __classname__?: string }).__classname__ ??
        (c as { constructor?: { name?: string } }).constructor?.name ??
        '';
      return cn === 'cc.Sprite' || cn.endsWith('.Sprite');
    }) as { spriteFrame?: SpriteFrameRuntime | null }) ?? null
  );
}

function textureName(tex: TextureRuntime | null | undefined): string {
  if (!tex) return '';
  const n = tex.name ?? (tex as { _name?: string })._name;
  return typeof n === 'string' ? n : '';
}

function textureUuid(tex: TextureRuntime | null | undefined): string {
  if (!tex) return '';
  return tex.uuid ?? tex._uuid ?? '';
}

/** 从当前节点 SpriteFrame 采集原始贴图信息，用于离线匹配源码资源 */
export function captureOriginalSpriteSnapshot(
  nodeId: string
): OriginalSpriteSnapshot | null {
  const scene = getSceneRoot();
  if (!scene) return null;

  const node = findNodeById(scene, nodeId);
  if (!node) return null;

  const sprite = getSpriteComponent(node);
  const frame = sprite?.spriteFrame;
  if (!frame) return null;

  const texture =
    (frame.texture ?? frame._texture) as TextureRuntime | null | undefined;
  const display = frame.originalSize ?? { width: 0, height: 0 };

  const frameName =
    frame.name ?? (frame as { _name?: string })._name ?? '(无贴图)';

  const assetUrls = texture
    ? collectAssetUrls(texture, texture.image as import('./textureExtract').ImageAssetRuntime)
    : [];

  return {
    frameName,
    textureUuid: textureUuid(texture ?? null),
    textureName: textureName(texture ?? null),
    assetUrls: assetUrls.map((u) => {
      try {
        return new URL(u, window.location.href).href;
      } catch {
        return u;
      }
    }),
    frameRect: frameRectForSnapshot(frame, texture ?? null),
    displaySize: {
      width: Math.round(display.width ?? frameRectForSnapshot(frame, texture ?? null).width),
      height: Math.round(display.height ?? frameRectForSnapshot(frame, texture ?? null).height),
    },
    isRotated: !!(frame.isRotated || frame._rotated),
  };
}

export function buildReplacementRecordInput(
  nodeId: string,
  file: File,
  imageBlob: Blob,
  width: number,
  height: number,
  originalSnapshot?: OriginalSpriteSnapshot | null
): ReplacementRecordInput | null {
  const scene = getSceneRoot();
  if (!scene) return null;

  const node = findNodeById(scene, nodeId);
  if (!node) return null;

  const original =
    originalSnapshot ?? captureOriginalSpriteSnapshot(nodeId);
  if (!original) return null;

  return {
    nodeId,
    nodeName: node.name || '(unnamed)',
    nodePath: buildNodePath(scene, nodeId) || node.name || nodeId,
    original,
    fileName: file.name,
    mimeType: file.type || 'image/png',
    width,
    height,
    imageBlob,
  };
}

/** 用于在下载的源码目录中搜索/替换的文件名线索 */
export function buildMatchKeys(snapshot: OriginalSpriteSnapshot): string[] {
  const keys = new Set<string>();

  const add = (v: string | undefined) => {
    if (!v || v.length < 2) return;
    keys.add(v);
    try {
      const base = decodeURIComponent(v.split(/[?#]/)[0].split('/').pop() ?? '');
      if (base.length >= 2) keys.add(base);
    } catch {
      const base = v.split(/[?#]/)[0].split('/').pop();
      if (base && base.length >= 2) keys.add(base);
    }
  };

  add(snapshot.frameName);
  add(snapshot.textureName);
  if (snapshot.textureUuid) keys.add(snapshot.textureUuid);

  for (const url of snapshot.assetUrls) {
    add(url);
    try {
      const u = new URL(url);
      add(u.pathname);
      add(u.pathname.split('/').pop() ?? '');
    } catch {
      /* ignore */
    }
  }

  return [...keys].filter((k) => k.length >= 2 && !k.startsWith('db://'));
}
