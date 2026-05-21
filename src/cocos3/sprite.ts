import { getNodeId, type TreeNodeInfo } from './sceneTree';

export interface SpriteMeta {
  frameName: string;
  enabled: boolean;
}

/** 获取 cc.Sprite 构造函数（运行时） */
function getSpriteCtor(): { new (): cc.Component } | null {
  const ccg = window.cc as typeof cc & {
    Sprite?: { new (): cc.Component };
  };
  return ccg.Sprite ?? null;
}

/** 节点是否挂载 Sprite 组件 */
export function nodeHasSprite(node: cc.Node): boolean {
  const Sprite = getSpriteCtor();
  if (Sprite && typeof node.getComponent === 'function') {
    const comp = node.getComponent(Sprite);
    if (comp) return true;
  }

  const comps =
    (node as cc.Node & { _components?: unknown[] })._components ?? [];
  return comps.some((c) => {
    const rec = c as {
      __classname__?: string;
      constructor?: { name?: string };
    };
    const cn = rec.__classname__ ?? rec.constructor?.name ?? '';
    return cn === 'cc.Sprite' || cn.endsWith('.Sprite');
  });
}

/** 读取 Sprite 摘要（用于列表展示） */
export function getSpriteMeta(node: cc.Node): SpriteMeta | null {
  const Sprite = getSpriteCtor();
  let comp: {
    enabled?: boolean;
    spriteFrame?: { name?: string; _name?: string };
  } | null = null;

  if (Sprite && typeof node.getComponent === 'function') {
    comp = node.getComponent(Sprite) as typeof comp;
  }

  if (!comp) {
    const comps =
      (node as cc.Node & { _components?: unknown[] })._components ?? [];
    comp = comps.find((c) => {
      const cn =
        (c as { __classname__?: string }).__classname__ ??
        (c as { constructor?: { name?: string } }).constructor?.name ??
        '';
      return cn === 'cc.Sprite' || cn.endsWith('.Sprite');
    }) as typeof comp;
  }

  if (!comp) return null;

  const frame = comp.spriteFrame;
  const frameName =
    frame?.name || (frame as { _name?: string })?._name || '(无贴图)';

  return {
    frameName,
    enabled: comp.enabled !== false,
  };
}

function baseInfo(node: cc.Node): TreeNodeInfo {
  const meta = getSpriteMeta(node);
  return {
    id: getNodeId(node),
    name: node.name || '(unnamed)',
    active: node.active !== false,
    children: [],
    hasSprite: !!meta,
    spriteHint: meta
      ? `${meta.frameName}${meta.enabled ? '' : ' [禁用]'}`
      : undefined,
  };
}

/**
 * 压缩场景树：无 Sprite 且仅有一个子节点时，合并为单链（名称用 › 连接）
 */
export function buildCompressedTreeInfo(root: cc.Node): TreeNodeInfo {
  const walk = (node: cc.Node): TreeNodeInfo => {
    const info = baseInfo(node);
    const sorted = [...(node.children ?? [])]
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    let children = sorted.map((c) => walk(c));

    while (!info.hasSprite && children.length === 1) {
      const only = children[0];
      info.name = `${info.name} › ${only.name}`;
      info.id = only.id;
      info.active = only.active;
      info.hasSprite = only.hasSprite;
      info.spriteHint = only.spriteHint;
      children = only.children;
    }

    info.children = children;
    return info;
  };

  return walk(root);
}

/**
 * Sprite 树：仅保留「自身有 Sprite」或「后代含 Sprite」的节点路径
 */
export function buildSpriteTreeInfo(root: cc.Node): TreeNodeInfo | null {
  const walk = (node: cc.Node): TreeNodeInfo | null => {
    const info = baseInfo(node);
    const sorted = [...(node.children ?? [])]
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const children = sorted
      .map((c) => walk(c))
      .filter((c): c is TreeNodeInfo => c !== null);

    if (!info.hasSprite && children.length === 0) {
      return null;
    }

    info.children = children;
    return info;
  };

  return walk(root);
}

export function countSpriteNodes(node: TreeNodeInfo): number {
  let n = node.hasSprite ? 1 : 0;
  for (const c of node.children) {
    n += countSpriteNodes(c);
  }
  return n;
}

export function hashSpriteTree(node: TreeNodeInfo): string {
  const parts = [
    node.id,
    node.name,
    node.hasSprite ? '1' : '0',
    node.spriteHint ?? '',
    String(node.children.length),
  ];
  for (const c of node.children) {
    parts.push(hashSpriteTree(c));
  }
  return parts.join('|');
}
